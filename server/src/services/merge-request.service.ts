import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Branch,
  Commit,
  MergeRequest,
  MergeRequestStatus,
  SpatialFeature,
  User,
  UserRole,
} from 'src/entities';
import { Repository } from 'typeorm';
import { BranchService } from './branch.service';
import { CommitService } from './commit.service';
import {
  CreateMergeRequestDto,
  ResolveMergeConflictsDto,
  ReviewMergeRequestDto,
} from 'src/dto/merge-request.dto';

@Injectable()
export class MergeRequestService {
  constructor(
    @InjectRepository(MergeRequest)
    private mergeRequestRepository: Repository<MergeRequest>,
    @InjectRepository(Branch)
    private branchRepository: Repository<Branch>,
    @InjectRepository(Commit)
    private commitRepository: Repository<Commit>,
    @InjectRepository(SpatialFeature)
    private spatialFeatureRepository: Repository<SpatialFeature>,
    private branchService: BranchService,
    private commitService: CommitService,
  ) {}

  async create(
    createMergeRequestDto: CreateMergeRequestDto,
    user: User,
  ): Promise<MergeRequest> {
    const { sourceBranchId, targetBranchId, title, description } =
      createMergeRequestDto;

    const sourceBranch = await this.branchService.findOne(sourceBranchId, user);
    const targetBranch = await this.branchService.findOne(targetBranchId, user);

    if (sourceBranch.isDisabled) {
      throw new BadRequestException(
        'Cannot create merge request from a disabled branch',
      );
    }

    if (!targetBranch.isMain) {
      throw new BadRequestException('Target branch must be the main branch');
    }

    if (sourceBranch.datasetId !== targetBranch.datasetId) {
      throw new BadRequestException('Branches must belong to the same dataset');
    }

    const conflictData = await this.branchService.detectConflicts(
      sourceBranch,
      targetBranch,
    );

    // Check if the source branch's latest commit is a conflict resolution commit
    let hasUnresolvedConflicts = conflictData.length > 0;

    if (conflictData.length > 0 && sourceBranch.headCommitId) {
      const latestCommit = await this.commitRepository.findOne({
        where: { id: sourceBranch.headCommitId },
      });

      // If the latest commit is a resolution commit, check if target has changed since
      if (
        latestCommit?.message.includes('Resolve conflicts with main branch')
      ) {
        // Check if target branch has been updated since the resolution
        const targetLastUpdated = new Date(
          targetBranch.updatedAt || targetBranch.createdAt,
        );
        const resolutionTime = new Date(latestCommit.createdAt);

        // If target hasn't changed since resolution, conflicts are resolved
        if (targetLastUpdated <= resolutionTime) {
          hasUnresolvedConflicts = false;
        }
        // If target has changed, these are new conflicts that need resolution
      }
    }

    const mergeRequest = this.mergeRequestRepository.create({
      title,
      description,
      sourceBranchId,
      targetBranchId,
      createdById: user.id,
      hasConflicts: hasUnresolvedConflicts,
      conflicts: hasUnresolvedConflicts ? conflictData : [],
    });

    return this.mergeRequestRepository.save(mergeRequest);
  }

  findAll(user: User): Promise<MergeRequest[]> {
    return this.mergeRequestRepository
      .createQueryBuilder('mr')
      .leftJoinAndSelect('mr.sourceBranch', 'sourceBranch')
      .leftJoinAndSelect('mr.targetBranch', 'targetBranch')
      .leftJoinAndSelect('targetBranch.dataset', 'dataset')
      .leftJoinAndSelect('mr.createdBy', 'createdBy')
      .leftJoinAndSelect('mr.reviewedBy', 'reviewedBy')
      .where('dataset.departmentId = :departmentId', {
        departmentId: user.departmentId,
      })
      .orderBy('mr.createdAt', 'DESC')
      .getMany();
  }

  async findOne(id: string, user: User): Promise<MergeRequest> {
    const mergeRequest = await this.mergeRequestRepository.findOne({
      where: { id },
      relations: [
        'sourceBranch',
        'targetBranch',
        'targetBranch.dataset',
        'createdBy',
        'reviewedBy',
      ],
    });

    if (!mergeRequest) {
      throw new NotFoundException('Merge request not found');
    }

    if (mergeRequest.targetBranch.dataset.departmentId !== user.departmentId) {
      throw new NotFoundException('Access denied to this merge request');
    }

    // Recheck if conflicts are still valid (in case they were resolved at branch level)
    if (
      mergeRequest.hasConflicts &&
      mergeRequest.status === MergeRequestStatus.OPEN &&
      mergeRequest.sourceBranch.headCommitId
    ) {
      const latestCommit = await this.commitRepository.findOne({
        where: { id: mergeRequest.sourceBranch.headCommitId },
      });

      // If the latest commit is a resolution commit, check if target has changed since
      if (
        latestCommit?.message.includes('Resolve conflicts with main branch')
      ) {
        const targetLastUpdated = new Date(
          mergeRequest.targetBranch.updatedAt ||
            mergeRequest.targetBranch.createdAt,
        );
        const resolutionTime = new Date(latestCommit.createdAt);

        // If target hasn't changed since resolution, conflicts are resolved
        if (targetLastUpdated <= resolutionTime) {
          mergeRequest.hasConflicts = false;
          mergeRequest.conflicts = [];
          await this.mergeRequestRepository.save(mergeRequest);
        }
      }
    }

    return mergeRequest;
  }

  async review(
    id: string,
    reviewDto: ReviewMergeRequestDto,
    user: User,
  ): Promise<MergeRequest> {
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can review merge requests');
    }

    const mergeRequest = await this.findOne(id, user);

    if (mergeRequest.status !== MergeRequestStatus.OPEN) {
      throw new BadRequestException('Merge request is not open');
    }

    if (
      reviewDto.status === MergeRequestStatus.APPROVED &&
      mergeRequest.hasConflicts
    ) {
      throw new BadRequestException(
        'Cannot aprove merge request with unresolved conflicts',
      );
    }

    mergeRequest.status = reviewDto.status;
    mergeRequest.reviewedById = user.id;
    mergeRequest.reviewComment = reviewDto.reviewComment || '';

    const updateMergeRequest =
      await this.mergeRequestRepository.save(mergeRequest);

    if (reviewDto.status === MergeRequestStatus.APPROVED) {
      await this.performMerge(updateMergeRequest, user);
    }

    return updateMergeRequest;
  }

  async performMerge(mergeRequest: MergeRequest, user: User): Promise<void> {
    const sourceBranch = await this.branchService.findOne(
      mergeRequest.sourceBranchId,
      user,
    );
    const targetBranch = await this.branchService.findOne(
      mergeRequest.targetBranchId,
      user,
    );

    const sourceFeatures = await this.branchService.getLatestFeatures(
      sourceBranch.id,
    );

    const mergeCommit = this.commitRepository.create({
      message: `Merge branch '${sourceBranch.name}' into '${targetBranch.name}'`,
      branchId: targetBranch.id,
      authorId: user.id,
      parentCommitId: targetBranch.headCommitId,
    });

    const savedMergeCommit = await this.commitRepository.save(mergeCommit);

    const mergedFeatures = sourceFeatures.map((feature) => {
      return this.spatialFeatureRepository.create({
        featureId: feature.featureId,
        geometryType: feature.geometryType,
        geometry: feature.geometry,
        geom: feature.geom,
        properties: feature.properties,
        operation: feature.operation,
        commitId: savedMergeCommit.id,
      });
    });

    await this.spatialFeatureRepository.save(mergedFeatures);

    // Update target branch head - use save() to trigger updatedAt
    targetBranch.headCommitId = savedMergeCommit.id;
    await this.branchRepository.save(targetBranch);

    // Disable the source branch after successful merge
    sourceBranch.isDisabled = true;
    await this.branchRepository.save(sourceBranch);

    mergeRequest.status = MergeRequestStatus.MERGED;
    mergeRequest.mergedAt = new Date();
    await this.mergeRequestRepository.save(mergeRequest);
  }

  async resolveConflicts(
    resolveDto: ResolveMergeConflictsDto,
    user: User,
  ): Promise<MergeRequest> {
    const mergeRequest = await this.findOne(resolveDto.mergeRequestId, user);

    if (!mergeRequest.hasConflicts) {
      throw new BadRequestException('No conflicts to resolve');
    }

    const resolvedConflicts = mergeRequest.conflicts.map((conflict) => {
      const resolution = resolveDto.resolutions.find(
        (r) => r.featureId === conflict.featureId,
      );

      if (!resolution) return conflict;

      return {
        ...conflict,
        resolved: true,
        resolution: resolution.resolution,
        resolutionData: resolution.customData,
      };
    });

    mergeRequest.conflicts = resolvedConflicts;
    mergeRequest.hasConflicts = resolvedConflicts.some((c) => !c.resolved);

    // Clear the unresolved conflicts flag on the source branch if all conflicts are resolved
    if (!mergeRequest.hasConflicts) {
      await this.branchRepository.update(mergeRequest.sourceBranchId, {
        hasUnresolvedConflicts: false,
      });
    }

    return this.mergeRequestRepository.save(mergeRequest);
  }

  async getConflicts(id: string, user: User): Promise<any> {
    const mergeRequest = await this.findOne(id, user);

    if (!mergeRequest.hasConflicts) {
      return { hasConflicts: false, conflicts: [] };
    }

    return { hasConflicts: true, conflicts: mergeRequest.conflicts };
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  BranchConflictsDto,
  ConflictDetail,
  CreateBranchDto,
  ResolveBranchConflictsDto,
} from 'src/dto/branch.dto';
import {
  Branch,
  Commit,
  FeatureOperation,
  MergeRequest,
  MergeRequestStatus,
  SpatialFeature,
  User,
  UserRole,
} from 'src/entities';
import { In, Repository } from 'typeorm';

@Injectable()
export class BranchService {
  constructor(
    @InjectRepository(Branch)
    private branchRepository: Repository<Branch>,
    @InjectRepository(Commit)
    private commitRepository: Repository<Commit>,
    @InjectRepository(SpatialFeature)
    private spatialFeatureRepository: Repository<SpatialFeature>,
    @InjectRepository(MergeRequest)
    private mergeRequestRepository: Repository<MergeRequest>,
  ) {}

  async create(createBranchDto: CreateBranchDto, user: User): Promise<Branch> {
    const { name, datasetId } = createBranchDto;

    const mainBranch = await this.branchRepository.findOne({
      where: {
        datasetId,
        isMain: true,
      },
    });

    if (!mainBranch) {
      throw new NotFoundException('Main branch not found for the dataset');
    }

    const existingBranch = await this.branchRepository.findOne({
      where: { name, datasetId },
    });

    if (existingBranch) {
      throw new Error(
        'Branch with the same name already exists in the dataset',
      );
    }

    const branch = this.branchRepository.create({
      name,
      isMain: false,
      datasetId,
      createdById: user.id,
      headCommitId: mainBranch.headCommitId,
    });

    return await this.branchRepository.save(branch);
  }

  async findAll(datasetId: string, user: User): Promise<Branch[]> {
    return await this.branchRepository.find({
      where: {
        datasetId,
        dataset: {
          departmentId: user.departmentId,
        },
      },
      relations: {
        createdBy: true,
        commits: true,
      },
    });
  }

  async findOne(id: string, user: User): Promise<Branch> {
    const branch = await this.branchRepository.findOne({
      where: {
        id,
        dataset: {
          departmentId: user.departmentId,
        },
      },
      relations: {
        dataset: true,
        createdBy: true,
        commits: true,
      },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    return branch;
  }

  async fetchMainBranch(
    branchId: string,
    user: User,
  ): Promise<BranchConflictsDto> {
    const branch = await this.findOne(branchId, user);

    if (branch.isMain) {
      throw new BadRequestException('Branch is already the main branch');
    }

    const mainBranch = await this.branchRepository.findOne({
      where: {
        datasetId: branch.datasetId,
        isMain: true,
      },
    });

    if (!mainBranch) {
      throw new NotFoundException('Main branch not found for the dataset');
    }

    const conflicts = await this.detectConflicts(branch, mainBranch);

    // Check if the latest commit is a conflict resolution commit
    let shouldMarkAsUnresolved = conflicts.length > 0;

    if (conflicts.length > 0 && branch.headCommitId) {
      const latestCommit = await this.commitRepository.findOne({
        where: { id: branch.headCommitId },
      });

      // If the latest commit is a resolution commit, check if main has changed since
      if (
        latestCommit?.message.includes('Resolve conflicts with main branch')
      ) {
        // Check if main branch has been updated since the resolution
        const mainLastUpdated = new Date(
          mainBranch.updatedAt || mainBranch.createdAt,
        );
        const resolutionTime = new Date(latestCommit.createdAt);

        // If main hasn't changed since resolution, these aren't new conflicts
        if (mainLastUpdated <= resolutionTime) {
          shouldMarkAsUnresolved = false;
        }
        // If main has changed, these are potentially new conflicts, keep as unresolved
      }
    }

    // Update the branch's unresolved conflicts flag
    await this.branchRepository.update(branchId, {
      hasUnresolvedConflicts: shouldMarkAsUnresolved,
    });

    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
    };
  }

  async detectConflicts(
    sourceBranch: Branch,
    targetBranch: Branch,
  ): Promise<ConflictDetail[]> {
    const conflicts: ConflictDetail[] = [];

    const sourceCommit = await this.commitRepository.findOne({
      where: { id: sourceBranch.headCommitId },
      relations: {
        features: true,
      },
    });

    const targetCommit = await this.commitRepository.findOne({
      where: { id: targetBranch.headCommitId },
      relations: {
        features: true,
      },
    });

    if (!sourceCommit || !targetCommit) {
      return conflicts;
    }

    const sourceFeatures = await this.getLatestFeatures(sourceBranch.id);
    const targetFeatures = await this.getLatestFeatures(targetBranch.id);

    const sourceFeatureMap = new Map(
      sourceFeatures.map((f) => [f.featureId, f]),
    );

    const targetFeatureMap = new Map(
      targetFeatures.map((f) => [f.featureId, f]),
    );

    for (const [featureId, sourceFeature] of sourceFeatureMap) {
      const targetFeature = targetFeatureMap.get(featureId);

      if (targetFeature) {
        if (
          JSON.stringify(sourceFeature.geometry) !==
          JSON.stringify(targetFeature.geometry)
        ) {
          conflicts.push({
            featureId,
            mainVersion: targetFeature,
            branchVersion: sourceFeature,
            conflictType: 'both_modified',
          });
        }
      }
    }

    return conflicts;
  }

  async getLatestFeatures(branchId: string): Promise<SpatialFeature[]> {
    const branch = await this.branchRepository.findOne({
      where: { id: branchId },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    if (!branch.headCommitId) {
      return [];
    }

    const commits = await this.getCommitHistory(branch.headCommitId);

    const featureMap = new Map<string, SpatialFeature>();

    for (const commit of commits.reverse()) {
      for (const feature of commit.features) {
        if (feature.operation === FeatureOperation.DELETE) {
          featureMap.delete(feature.featureId);
        } else {
          featureMap.set(feature.featureId, feature);
        }
      }
    }

    return Array.from(featureMap.values());
  }

  private async getCommitHistory(headCommitId: string): Promise<Commit[]> {
    const commits: Commit[] = [];
    let currentCommitId: string | null = headCommitId;

    let maxIterations = 1000;

    while (currentCommitId && maxIterations > 0) {
      const commit = await this.commitRepository.findOne({
        where: { id: currentCommitId },
        relations: { features: true },
      });

      if (!commit) {
        break;
      }

      commits.push(commit);
      currentCommitId = commit.parentCommitId;
      maxIterations--;
    }

    return commits;
  }

  canEditBranch(branch: Branch, user: User): boolean {
    // Disabled branches cannot be edited
    if (branch.isDisabled) {
      return false;
    }

    if (branch.isMain) {
      return user.role === UserRole.ADMIN;
    }

    return branch.createdById === user.id || user.role === UserRole.ADMIN;
  }

  async hasOpenMergeRequest(branchId: string): Promise<boolean> {
    const openStatuses = [MergeRequestStatus.OPEN, MergeRequestStatus.APPROVED];

    const count = await this.mergeRequestRepository.count({
      where: {
        sourceBranchId: branchId,
        status: In(openStatuses),
      },
    });

    return count > 0;
  }

  async getBranchWithPermissions(
    id: string,
    user: User,
  ): Promise<{
    branch: Branch;
    canEdit: boolean;
    hasOpenMergeRequest: boolean;
    hasUnresolvedConflicts: boolean;
  }> {
    const branch = await this.findOne(id, user);
    const canEdit = this.canEditBranch(branch, user);
    const hasOpenMR = branch.isMain
      ? false
      : await this.hasOpenMergeRequest(id);

    return {
      branch,
      canEdit,
      hasOpenMergeRequest: hasOpenMR,
      hasUnresolvedConflicts: branch.hasUnresolvedConflicts,
    };
  }

  async resolveBranchConflicts(
    resolveDto: ResolveBranchConflictsDto,
    user: User,
  ): Promise<{ success: boolean; message: string }> {
    if (!resolveDto.branchId) {
      throw new BadRequestException('Branch ID is required');
    }

    const branch = await this.findOne(resolveDto.branchId, user);

    if (!branch.hasUnresolvedConflicts) {
      throw new BadRequestException('No unresolved conflicts on this branch');
    }

    if (!this.canEditBranch(branch, user)) {
      throw new BadRequestException(
        'You do not have permission to resolve conflicts on this branch',
      );
    }

    // Get the main branch to fetch resolved features from
    const mainBranch = await this.branchRepository.findOne({
      where: {
        datasetId: branch.datasetId,
        isMain: true,
      },
    });

    if (!mainBranch) {
      throw new NotFoundException('Main branch not found');
    }

    // Get latest features from both branches
    const branchFeatures = await this.getLatestFeatures(branch.id);
    const mainFeatures = await this.getLatestFeatures(mainBranch.id);

    // Create maps for easy lookup
    const branchFeatureMap = new Map(
      branchFeatures.map((f) => [f.featureId, f]),
    );
    const mainFeatureMap = new Map(mainFeatures.map((f) => [f.featureId, f]));

    // Apply resolutions by creating a merge commit with resolved features
    const resolvedFeatures: any[] = [];

    for (const resolution of resolveDto.resolutions) {
      const branchFeature = branchFeatureMap.get(resolution.featureId);
      const mainFeature = mainFeatureMap.get(resolution.featureId);

      if (resolution.resolution === 'use_main' && mainFeature) {
        // Use main branch version - update the feature in our branch
        resolvedFeatures.push({
          featureId: mainFeature.featureId,
          geometryType: mainFeature.geometryType,
          geometry: mainFeature.geometry,
          properties: mainFeature.properties,
          operation: FeatureOperation.UPDATE,
        });
      } else if (resolution.resolution === 'use_branch' && branchFeature) {
        // Keep branch version - re-commit it to mark as intentionally kept
        resolvedFeatures.push({
          featureId: branchFeature.featureId,
          geometryType: branchFeature.geometryType,
          geometry: branchFeature.geometry,
          properties: branchFeature.properties,
          operation: FeatureOperation.UPDATE,
        });
      }
    }

    // Always create a commit to mark that conflicts were resolved
    const resolutionSummary = resolveDto.resolutions.map((r) => ({
      featureId: r.featureId,
      resolution: r.resolution,
    }));

    const commit = this.commitRepository.create({
      message: `Resolve conflicts with main branch\n\nResolutions:\n${resolutionSummary.map((r) => `- ${r.featureId}: ${r.resolution}`).join('\n')}`,
      branchId: branch.id,
      authorId: user.id,
      parentCommitId: branch.headCommitId,
    });

    const savedCommit = await this.commitRepository.save(commit);

    // Save the resolved features (even if keeping branch version, we re-commit them)
    if (resolvedFeatures.length > 0) {
      const featuresToSave = resolvedFeatures.map((featureDto) => {
        return this.spatialFeatureRepository.create({
          featureId: featureDto.featureId,
          geometryType: featureDto.geometryType,
          geometry: featureDto.geometry,
          properties: featureDto.properties,
          operation: featureDto.operation,
          commitId: savedCommit.id,
        });
      });

      await this.spatialFeatureRepository.save(featuresToSave);
    }

    // Update branch head and clear unresolved conflicts flag
    // Use save() to trigger updatedAt timestamp
    // Clear loaded relations to prevent cascade save issues
    delete (branch as any).commits;
    delete (branch as any).dataset;
    delete (branch as any).createdBy;
    branch.headCommitId = savedCommit.id;
    branch.hasUnresolvedConflicts = false;
    await this.branchRepository.save(branch);

    return {
      success: true,
      message: 'Conflicts resolved successfully',
    };
  }
}

import {
  BadRequestException,
  ConflictException,
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
import { DataSource, Repository } from 'typeorm';
import { BranchService } from './branch.service';
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
    @InjectRepository(Commit)
    private commitRepository: Repository<Commit>,
    private branchService: BranchService,
    private dataSource: DataSource,
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

    let hasUnresolvedConflicts = conflictData.length > 0;

    if (conflictData.length > 0 && sourceBranch.headCommitId) {
      const latestCommit = await this.commitRepository.findOne({
        where: { id: sourceBranch.headCommitId },
      });

      if (
        latestCommit?.message.includes('Resolve conflicts with main branch')
      ) {
        const targetLastUpdated = new Date(
          targetBranch.updatedAt || targetBranch.createdAt,
        );
        const resolutionTime = new Date(latestCommit.createdAt);

        if (targetLastUpdated <= resolutionTime) {
          hasUnresolvedConflicts = false;
        }
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

    if (
      mergeRequest.hasConflicts &&
      mergeRequest.status === MergeRequestStatus.OPEN &&
      mergeRequest.sourceBranch.headCommitId
    ) {
      const latestCommit = await this.commitRepository.findOne({
        where: { id: mergeRequest.sourceBranch.headCommitId },
      });

      if (
        latestCommit?.message.includes('Resolve conflicts with main branch')
      ) {
        const targetLastUpdated = new Date(
          mergeRequest.targetBranch.updatedAt ||
            mergeRequest.targetBranch.createdAt,
        );
        const resolutionTime = new Date(latestCommit.createdAt);

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
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const sourceBranch = await this.branchService.findOne(
        mergeRequest.sourceBranchId,
        user,
      );
      const targetBranch = await this.branchService.findOne(
        mergeRequest.targetBranchId,
        user,
      );

      const lockedTargetBranch = await queryRunner.manager.findOne(Branch, {
        where: { id: targetBranch.id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!lockedTargetBranch) {
        throw new NotFoundException('Target branch not found');
      }

      if (lockedTargetBranch.headCommitId !== targetBranch.headCommitId) {
        throw new ConflictException(
          'Target branch has been updated by another user. Please refresh and try again.',
        );
      }

      const { features: sourceFeatures } =
        await this.branchService.getLatestFeatures(sourceBranch.id);

      const mergeCommit = queryRunner.manager.create(Commit, {
        message: `Merge branch '${sourceBranch.name}' into '${targetBranch.name}'`,
        branchId: targetBranch.id,
        authorId: user.id,
        parentCommitId: targetBranch.headCommitId,
      });

      const savedMergeCommit = await queryRunner.manager.save(mergeCommit);

      const mergedFeatures = sourceFeatures.map((feature) => {
        return queryRunner.manager.create(SpatialFeature, {
          featureId: feature.featureId,
          geometryType: feature.geometryType,
          geometry: feature.geometry,
          geom: feature.geom,
          properties: feature.properties,
          operation: feature.operation,
          commitId: savedMergeCommit.id,
        });
      });

      await queryRunner.manager.save(mergedFeatures);

      targetBranch.headCommitId = savedMergeCommit.id;
      delete (targetBranch as any).commits;
      delete (targetBranch as any).dataset;
      delete (targetBranch as any).createdBy;
      await queryRunner.manager.save(targetBranch);

      sourceBranch.isDisabled = true;
      delete (sourceBranch as any).commits;
      delete (sourceBranch as any).dataset;
      delete (sourceBranch as any).createdBy;
      await queryRunner.manager.save(sourceBranch);

      mergeRequest.status = MergeRequestStatus.MERGED;
      mergeRequest.mergedAt = new Date();
      await queryRunner.manager.save(mergeRequest);

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async resolveConflicts(
    resolveDto: ResolveMergeConflictsDto,
    user: User,
  ): Promise<MergeRequest> {
    const mergeRequest = await this.findOne(resolveDto.mergeRequestId, user);

    if (!mergeRequest.hasConflicts) {
      throw new BadRequestException('No conflicts to resolve');
    }

    const resolvedConflicts = mergeRequest.conflicts.map((conflict: any) => {
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
    mergeRequest.hasConflicts = resolvedConflicts.some((c: any) => !c.resolved);

    if (!mergeRequest.hasConflicts) {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        const sourceBranch = await this.branchService.findOne(
          mergeRequest.sourceBranchId,
          user,
        );
        const targetBranch = await this.branchService.findOne(
          mergeRequest.targetBranchId,
          user,
        );

        const lockedSourceBranch = await queryRunner.manager.findOne(Branch, {
          where: { id: sourceBranch.id },
          lock: { mode: 'pessimistic_write' },
        });

        if (!lockedSourceBranch) {
          throw new NotFoundException('Source branch not found');
        }

        const expectedSourceHeadCommitId =
          resolveDto.expectedSourceHeadCommitId !== undefined
            ? resolveDto.expectedSourceHeadCommitId
            : sourceBranch.headCommitId;

        if (lockedSourceBranch.headCommitId !== expectedSourceHeadCommitId) {
          throw new ConflictException(
            'Source branch has been updated by another user. Please refresh and try again.',
          );
        }

        const { features: branchFeatures } =
          await this.branchService.getLatestFeatures(sourceBranch.id);
        const { features: mainFeatures } =
          await this.branchService.getLatestFeatures(targetBranch.id);

        const branchFeatureMap = new Map(
          branchFeatures.map((f) => [f.featureId, f]),
        );
        const mainFeatureMap = new Map(
          mainFeatures.map((f) => [f.featureId, f]),
        );

        const resolvedFeatures: any[] = [];

        const commonAncestor = await this.branchService.findCommonAncestor(
          sourceBranch,
          targetBranch,
        );

        for (const resolution of resolveDto.resolutions) {
          const branchFeature = branchFeatureMap.get(resolution.featureId);
          const mainFeature = mainFeatureMap.get(resolution.featureId);

          let resolvedFeature: any = null;

          switch (resolution.resolution) {
            case 'use_main':
              if (mainFeature) {
                resolvedFeature = {
                  featureId: mainFeature.featureId,
                  geometryType: mainFeature.geometryType,
                  geometry: mainFeature.geometry,
                  properties: mainFeature.properties,
                  operation: 'update',
                };
              }
              break;

            case 'use_branch':
              if (branchFeature) {
                resolvedFeature = {
                  featureId: branchFeature.featureId,
                  geometryType: branchFeature.geometryType,
                  geometry: branchFeature.geometry,
                  properties: branchFeature.properties,
                  operation: 'update',
                };
              }
              break;

            case 'use_ancestor': {
              if (commonAncestor) {
                const ancestorFeature =
                  await this.branchService.getFeatureAtCommit(
                    commonAncestor.id,
                    resolution.featureId,
                  );
                if (ancestorFeature) {
                  resolvedFeature = {
                    featureId: ancestorFeature.featureId,
                    geometryType: ancestorFeature.geometryType,
                    geometry: ancestorFeature.geometry,
                    properties: ancestorFeature.properties,
                    operation: 'update',
                  };
                } else {
                  throw new BadRequestException(
                    `Ancestor version not found for feature ${resolution.featureId}`,
                  );
                }
              } else {
                throw new BadRequestException(
                  'No common ancestor found for use_ancestor resolution',
                );
              }
              break;
            }

            case 'delete': {
              const featureToDelete = branchFeature || mainFeature;
              if (featureToDelete) {
                resolvedFeature = {
                  featureId: featureToDelete.featureId,
                  geometryType: featureToDelete.geometryType,
                  geometry: featureToDelete.geometry,
                  properties: {},
                  operation: 'delete',
                };
              }
              break;
            }

            case 'custom': {
              if (!resolution.customData?.geometry) {
                throw new BadRequestException(
                  `Custom geometry required for custom resolution of feature ${resolution.featureId}`,
                );
              }
              const baseFeature = branchFeature || mainFeature;
              if (baseFeature) {
                resolvedFeature = {
                  featureId: resolution.featureId,
                  geometryType: baseFeature.geometryType,
                  geometry: resolution.customData.geometry,
                  properties: resolution.customData.properties || {},
                  operation: 'update',
                };
              }
              break;
            }

            default:
              throw new BadRequestException(
                // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                `Unknown resolution strategy: ${resolution.resolution}`,
              );
          }

          if (resolvedFeature) {
            resolvedFeatures.push(resolvedFeature);
          }
        }

        const resolutionSummary = resolveDto.resolutions.map((r) => ({
          featureId: r.featureId,
          resolution: r.resolution,
        }));

        const commit = queryRunner.manager.create(Commit, {
          message: `Resolve conflicts with main branch\n\nResolutions:\n${resolutionSummary.map((r) => `- ${r.featureId}: ${r.resolution}`).join('\n')}`,
          branchId: sourceBranch.id,
          authorId: user.id,
          parentCommitId: sourceBranch.headCommitId,
        });

        const savedCommit = await queryRunner.manager.save(commit);

        if (resolvedFeatures.length > 0) {
          const featuresToSave = resolvedFeatures.map((featureDto) => {
            return queryRunner.manager.create(SpatialFeature, {
              featureId: featureDto.featureId,
              geometryType: featureDto.geometryType,
              geometry: featureDto.geometry,
              properties: featureDto.properties,
              operation: featureDto.operation,
              commitId: savedCommit.id,
            });
          });

          await queryRunner.manager.save(featuresToSave);
        }

        delete (sourceBranch as any).commits;
        delete (sourceBranch as any).dataset;
        delete (sourceBranch as any).createdBy;
        sourceBranch.headCommitId = savedCommit.id;
        sourceBranch.hasUnresolvedConflicts = false;
        await queryRunner.manager.save(sourceBranch);

        await queryRunner.manager.save(mergeRequest);

        await queryRunner.commitTransaction();
        return mergeRequest;
      } catch (error) {
        await queryRunner.rollbackTransaction();
        throw error;
      } finally {
        await queryRunner.release();
      }
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

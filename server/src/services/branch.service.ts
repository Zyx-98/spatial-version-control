import {
  BadRequestException,
  ConflictException,
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
import { DataSource, In, Repository } from 'typeorm';

@Injectable()
export class BranchService {
  constructor(
    @InjectRepository(Branch)
    private branchRepository: Repository<Branch>,
    @InjectRepository(Commit)
    private commitRepository: Repository<Commit>,
    @InjectRepository(MergeRequest)
    private mergeRequestRepository: Repository<MergeRequest>,
    @InjectRepository(SpatialFeature)
    private spatialFeatureRepository: Repository<SpatialFeature>,
    private dataSource: DataSource,
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

  async checkBranchExists(id: string, user: User): Promise<boolean> {
    const exists = await this.branchRepository.exists({
      where: {
        id,
        dataset: {
          departmentId: user.departmentId,
        },
      },
    });
    return exists;
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

    let shouldMarkAsUnresolved = conflicts.length > 0;

    if (conflicts.length > 0 && branch.headCommitId) {
      const latestCommit = await this.commitRepository.findOne({
        where: { id: branch.headCommitId },
      });

      if (
        latestCommit?.message.includes('Resolve conflicts with main branch')
      ) {
        const mainLastUpdated = new Date(
          mainBranch.updatedAt || mainBranch.createdAt,
        );
        const resolutionTime = new Date(latestCommit.createdAt);

        if (mainLastUpdated <= resolutionTime) {
          shouldMarkAsUnresolved = false;
        }
      }
    }

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
    if (!sourceBranch.headCommitId || !targetBranch.headCommitId) {
      return [];
    }

    const query = `
      WITH source_commit_ids AS (
        SELECT unnest(ancestor_ids) as id
        FROM commits WHERE id = $1
      ),
      target_commit_ids AS (
        SELECT unnest(ancestor_ids) as id
        FROM commits WHERE id = $2
      ),
      source_features AS (
        SELECT DISTINCT ON (sf.feature_id)
          sf.*
        FROM spatial_features sf
        WHERE sf.commit_id IN (SELECT id FROM source_commit_ids)
        ORDER BY sf.feature_id, sf.created_at DESC
      ),
      target_features AS (
        SELECT DISTINCT ON (sf.feature_id)
          sf.*
        FROM spatial_features sf
        WHERE sf.commit_id IN (SELECT id FROM target_commit_ids)
        ORDER BY sf.feature_id, sf.created_at DESC
      )
      SELECT
        sf.feature_id as "featureId",
        'both_modified' as "conflictType"
      FROM source_features sf
      INNER JOIN target_features tf ON sf.feature_id = tf.feature_id
      WHERE
        sf.operation != '${FeatureOperation.DELETE}'
        AND tf.operation != '${FeatureOperation.DELETE}'
        AND (
          NOT ST_Equals(sf.geom, tf.geom)
          OR sf.properties::text != tf.properties::text
        );
    `;

    const conflictIds = await this.dataSource.query(query, [
      sourceBranch.headCommitId,
      targetBranch.headCommitId,
    ]);

    const conflicts: ConflictDetail[] = [];

    if (conflictIds.length > 0) {
      const { features: sourceFeatures } = await this.getLatestFeatures(
        sourceBranch.id,
      );
      const { features: targetFeatures } = await this.getLatestFeatures(
        targetBranch.id,
      );

      const sourceFeatureMap = new Map(
        sourceFeatures.map((f) => [f.featureId, f]),
      );
      const targetFeatureMap = new Map(
        targetFeatures.map((f) => [f.featureId, f]),
      );

      const commonAncestor = await this.findCommonAncestor(
        sourceBranch,
        targetBranch,
      );

      for (const { featureId } of conflictIds) {
        const sourceFeature = sourceFeatureMap.get(featureId);
        const targetFeature = targetFeatureMap.get(featureId);

        if (sourceFeature && targetFeature) {
          let ancestorFeature: SpatialFeature | null = null;
          if (commonAncestor) {
            ancestorFeature = await this.getFeatureAtCommit(
              commonAncestor.id,
              featureId,
            );
          }

          conflicts.push({
            featureId,
            mainVersion: targetFeature,
            branchVersion: sourceFeature,
            ancestorVersion: ancestorFeature,
            conflictType: 'both_modified',
          });
        }
      }
    }

    return conflicts;
  }

  async findCommonAncestor(
    branch1: Branch,
    branch2: Branch,
  ): Promise<Commit | null> {
    if (!branch1.headCommitId || !branch2.headCommitId) {
      return null;
    }

    const branch1Commits = await this.getCommitHistory(branch1.headCommitId);
    const branch2Commits = await this.getCommitHistory(branch2.headCommitId);

    const branch1CommitIds = new Set(branch1Commits.map((c) => c.id));

    for (const commit of branch2Commits) {
      if (branch1CommitIds.has(commit.id)) {
        return commit;
      }
    }

    return null;
  }

  async getFeatureAtCommit(
    commitId: string,
    featureId: string,
  ): Promise<SpatialFeature | null> {
    const commit = await this.commitRepository.findOne({
      where: { id: commitId },
      relations: ['branch'],
    });

    if (!commit) {
      return null;
    }

    const features = new Map<string, SpatialFeature>();

    let currentCommit: Commit | null = commit;

    while (currentCommit) {
      const commitFeatures = await this.spatialFeatureRepository.find({
        where: { commitId: currentCommit.id },
      });

      for (const feature of commitFeatures) {
        if (!features.has(feature.featureId)) {
          if (feature.operation !== FeatureOperation.DELETE) {
            features.set(feature.featureId, feature);
          }
        }
      }

      if (currentCommit.parentCommitId) {
        currentCommit = await this.commitRepository.findOne({
          where: { id: currentCommit.parentCommitId },
        });
      } else {
        currentCommit = null;
      }
    }

    return features.get(featureId) || null;
  }

  async getLatestFeatures(
    branchId: string,
    page?: number,
    limit?: number,
    bbox?: string,
  ): Promise<{ features: SpatialFeature[]; total: number }> {
    const branch = await this.branchRepository.findOne({
      where: { id: branchId },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    if (!branch.headCommitId) {
      return { features: [], total: 0 };
    }

    const usePagination = page !== undefined && limit !== undefined;
    const paginationClause = usePagination ? `LIMIT $2 OFFSET $3` : '';

    let bboxFilter = '';
    const queryParams: any[] = [branch.headCommitId];

    if (bbox) {
      const [minLng, minLat, maxLng, maxLat] = bbox.split(',').map(parseFloat);
      if (![minLng, minLat, maxLng, maxLat].some(isNaN)) {
        const nextParamIndex = queryParams.length + 1;
        bboxFilter = `AND sf.geom && ST_MakeEnvelope($${nextParamIndex}, $${nextParamIndex + 1}, $${nextParamIndex + 2}, $${nextParamIndex + 3}, 4326)`;
        queryParams.push(minLng, minLat, maxLng, maxLat);
      }
    }

    if (usePagination) {
      queryParams.push(limit, (page - 1) * limit);
    }

    const query = `
      WITH commit_ids AS (
        SELECT unnest(ancestor_ids) as id
        FROM commits
        WHERE id = $1
      ),
      latest_features AS (
        SELECT DISTINCT ON (sf.feature_id)
          sf.id,
          sf.feature_id as "featureId",
          sf.geometry_type as "geometryType",
          sf.geometry,
          sf.properties,
          sf.operation,
          sf.commit_id as "commitId",
          sf.created_at as "createdAt"
        FROM spatial_features sf
        WHERE sf.commit_id IN (SELECT id FROM commit_ids)
          ${bboxFilter}
        ORDER BY sf.feature_id, sf.created_at DESC
      )
      SELECT * FROM latest_features
      WHERE operation != '${FeatureOperation.DELETE}'
      ORDER BY "featureId"
      ${paginationClause};
    `;

    const results = await this.dataSource.query(query, queryParams);

    let total = results.length;
    if (usePagination) {
      const countQuery = `
        WITH commit_ids AS (
          SELECT unnest(ancestor_ids) as id
          FROM commits
          WHERE id = $1
        ),
        latest_features AS (
          SELECT DISTINCT ON (sf.feature_id)
            sf.feature_id
          FROM spatial_features sf
          WHERE sf.commit_id IN (SELECT id FROM commit_ids)
            ${bboxFilter}
          ORDER BY sf.feature_id, sf.created_at DESC
        )
        SELECT COUNT(*) as count
        FROM latest_features
        WHERE operation != '${FeatureOperation.DELETE}';
      `;

      const countParams = queryParams.slice(0, queryParams.length - 2);
      const countResult = await this.dataSource.query(countQuery, countParams);
      total = parseInt(countResult[0]?.count || '0');
    }

    return { features: results, total };
  }

  private async getCommitHistory(headCommitId: string): Promise<Commit[]> {
    const query = `
      WITH commit_ids AS (
        SELECT unnest(ancestor_ids) as id
        FROM commits
        WHERE id = $1
      )
      SELECT
        c.id,
        c.branch_id as "branchId",
        c.message,
        c.author_id as "authorId",
        c.parent_commit_id as "parentCommitId",
        c.created_at as "createdAt"
      FROM commits c
      WHERE c.id IN (SELECT id FROM commit_ids)
      ORDER BY c.created_at ASC;
    `;

    const results = await this.dataSource.query(query, [headCommitId]);

    return results;
  }

  canEditBranch(branch: Branch, user: User): boolean {
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

    const mainBranch = await this.branchRepository.findOne({
      where: {
        datasetId: branch.datasetId,
        isMain: true,
      },
    });

    if (!mainBranch) {
      throw new NotFoundException('Main branch not found');
    }

    const { features: branchFeatures } = await this.getLatestFeatures(
      branch.id,
    );
    const { features: mainFeatures } = await this.getLatestFeatures(
      mainBranch.id,
    );

    const branchFeatureMap = new Map(
      branchFeatures.map((f) => [f.featureId, f]),
    );
    const mainFeatureMap = new Map(mainFeatures.map((f) => [f.featureId, f]));

    const resolvedFeatures: any[] = [];

    const commonAncestor = await this.findCommonAncestor(branch, mainBranch);

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
              operation: FeatureOperation.UPDATE,
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
              operation: FeatureOperation.UPDATE,
            };
          }
          break;

        case 'use_ancestor':
          if (commonAncestor) {
            const ancestorFeature = await this.getFeatureAtCommit(
              commonAncestor.id,
              resolution.featureId,
            );
            if (ancestorFeature) {
              resolvedFeature = {
                featureId: ancestorFeature.featureId,
                geometryType: ancestorFeature.geometryType,
                geometry: ancestorFeature.geometry,
                properties: ancestorFeature.properties,
                operation: FeatureOperation.UPDATE,
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

        case 'delete': {
          const featureToDelete = branchFeature || mainFeature;
          if (featureToDelete) {
            resolvedFeature = {
              featureId: featureToDelete.featureId,
              geometryType: featureToDelete.geometryType,
              geometry: featureToDelete.geometry,
              properties: {},
              operation: FeatureOperation.DELETE,
            };
          }
          break;
        }

        case 'custom': {
          if (!resolution.customGeometry) {
            throw new BadRequestException(
              `Custom geometry required for custom resolution of feature ${resolution.featureId}`,
            );
          }
          const baseFeature = branchFeature || mainFeature;
          if (baseFeature) {
            resolvedFeature = {
              featureId: resolution.featureId,
              geometryType: baseFeature.geometryType,
              geometry: resolution.customGeometry,
              properties: resolution.customProperties || {},
              operation: FeatureOperation.UPDATE,
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

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const lockedBranch = await queryRunner.manager.findOne(Branch, {
        where: { id: branch.id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!lockedBranch) {
        throw new NotFoundException('Branch not found');
      }

      const expectedHeadCommitId =
        resolveDto.expectedHeadCommitId !== undefined
          ? resolveDto.expectedHeadCommitId
          : branch.headCommitId;

      if (lockedBranch.headCommitId !== expectedHeadCommitId) {
        throw new ConflictException(
          'Branch has been updated by another user. Please refresh and try again.',
        );
      }

      const resolutionSummary = resolveDto.resolutions.map((r) => ({
        featureId: r.featureId,
        resolution: r.resolution,
      }));

      const commit = queryRunner.manager.create(Commit, {
        message: `Resolve conflicts with main branch\n\nResolutions:\n${resolutionSummary.map((r) => `- ${r.featureId}: ${r.resolution}`).join('\n')}`,
        branchId: branch.id,
        authorId: user.id,
        parentCommitId: branch.headCommitId,
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

      delete (branch as any).commits;
      delete (branch as any).dataset;
      delete (branch as any).createdBy;
      branch.headCommitId = savedCommit.id;
      branch.hasUnresolvedConflicts = false;
      await queryRunner.manager.save(branch);

      await queryRunner.commitTransaction();

      return {
        success: true,
        message: 'Conflicts resolved successfully',
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}

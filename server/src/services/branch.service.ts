import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import {
  BadRequestException,
  ConflictException,
  Inject,
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
import {
  LOCK_SERVICE,
  LockService,
} from 'src/interfaces/lock-service.interface';

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
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @Inject(LOCK_SERVICE) private lockService: LockService,
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

  async canAccessBranch(id: string, user: User): Promise<boolean> {
    const cacheKey = `branch_access:${id}:${user.id}`;

    const hasAccessInCache = await this.cacheManager.get<boolean>(cacheKey);

    if (hasAccessInCache !== undefined) {
      return hasAccessInCache;
    }

    return await this.lockService.withLock(
      cacheKey,
      async () => {
        const cachedValue = await this.cacheManager.get<boolean>(cacheKey);
        if (cachedValue !== undefined) {
          return cachedValue;
        }

        const hasAccess = await this.branchRepository.exists({
          where: {
            id,
            dataset: {
              departmentId: user.departmentId,
            },
          },
        });

        await this.cacheManager.set(cacheKey, hasAccess, 2 * 60 * 60 * 1000); // 2 hours

        return hasAccess;
      },
      3000,
    );
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

    if (!mainBranch.headCommitId) {
      return { hasConflicts: false, conflicts: [], message: 'fast-forward' };
    }

    if (mainBranch.headCommitId === branch.headCommitId) {
      return { hasConflicts: false, conflicts: [], message: 'fast-forward' };
    }

    const forkResult = await this.dataSource.query(
      `SELECT find_common_ancestor($1, $2) as fork_id`,
      [branch.headCommitId, mainBranch.headCommitId],
    );
    const forkCommitId: string | null = forkResult[0]?.fork_id || null;

    if (!forkCommitId) {
      return { hasConflicts: false, conflicts: [], message: 'fast-forward' };
    }

    if (forkCommitId === mainBranch.headCommitId) {
      return { hasConflicts: false, conflicts: [], message: 'fast-forward' };
    }

    const branchHasOwnCommits = branch.headCommitId !== forkCommitId;

    if (!branchHasOwnCommits) {
      await this.branchRepository.update(branchId, {
        headCommitId: mainBranch.headCommitId,
        hasUnresolvedConflicts: false,
      });

      return { hasConflicts: false, conflicts: [], message: 'fast-forward' };
    }

    const conflictIds = await this.dataSource.query(
      `
      WITH
      branch_only_commits AS (
        SELECT unnest(b.ancestor_ids) as id
        FROM commits b WHERE b.id = $1
        EXCEPT
        SELECT unnest(f.ancestor_ids) as id
        FROM commits f WHERE f.id = $3
      ),
      main_only_commits AS (
        SELECT unnest(m.ancestor_ids) as id
        FROM commits m WHERE m.id = $2
        EXCEPT
        SELECT unnest(f.ancestor_ids) as id
        FROM commits f WHERE f.id = $3
      ),
      branch_features AS (
        SELECT DISTINCT ON (sf.feature_id) sf.*
        FROM spatial_features sf
        WHERE sf.commit_id IN (SELECT id FROM branch_only_commits)
        ORDER BY sf.feature_id, sf.created_at DESC
      ),
      main_features AS (
        SELECT DISTINCT ON (sf.feature_id) sf.*
        FROM spatial_features sf
        WHERE sf.commit_id IN (SELECT id FROM main_only_commits)
        ORDER BY sf.feature_id, sf.created_at DESC
      )
      SELECT
        bf.feature_id as "featureId",
        'both_modified' as "conflictType"
      FROM branch_features bf
      INNER JOIN main_features mf ON bf.feature_id = mf.feature_id
      WHERE bf.operation != '${FeatureOperation.DELETE}'
        AND mf.operation != '${FeatureOperation.DELETE}'
        AND (
          NOT ST_Equals(bf.geom, mf.geom)
          OR bf.properties::text != mf.properties::text
        )
    `,
      [branch.headCommitId, mainBranch.headCommitId, forkCommitId],
    );

    if (conflictIds.length === 0) {
      await this.createFetchMergeCommit(branch, mainBranch, forkCommitId, user);
      return { hasConflicts: false, conflicts: [], message: 'auto-merged' };
    }

    const featureIds = conflictIds.map((c: any) => c.featureId);

    const [branchSnap, mainSnap, ancestorFeatures] = await Promise.all([
      this.getLatestFeatures(branch.id),
      this.getLatestFeatures(mainBranch.id),
      // Get state of each conflicted feature as it was at the fork point.
      this.dataSource.query(
        `
        SELECT DISTINCT ON (sf.feature_id)
          sf.feature_id as "featureId",
          sf.geometry_type as "geometryType",
          sf.geometry, sf.geom, sf.properties, sf.operation,
          sf.commit_id as "commitId", sf.created_at as "createdAt"
        FROM spatial_features sf
        WHERE sf.commit_id = ANY(
          SELECT unnest(ancestor_ids) FROM commits WHERE id = $1
        )
        AND sf.feature_id = ANY($2)
        AND sf.operation != '${FeatureOperation.DELETE}'
        ORDER BY sf.feature_id, sf.created_at DESC
      `,
        [forkCommitId, featureIds],
      ),
    ]);

    const branchMap = new Map(branchSnap.features.map((f) => [f.featureId, f]));
    const mainMap = new Map(mainSnap.features.map((f) => [f.featureId, f]));
    const ancestorMap = new Map(
      ancestorFeatures.map((f: any) => [f.featureId, f]),
    );

    const conflicts: ConflictDetail[] = conflictIds.map((c: any) => ({
      featureId: c.featureId,
      branchVersion: branchMap.get(c.featureId) || null,
      mainVersion: mainMap.get(c.featureId) || null,
      ancestorVersion: ancestorMap.get(c.featureId) || null,
      conflictType: 'both_modified' as const,
    }));

    await this.branchRepository.update(branchId, {
      hasUnresolvedConflicts: true,
    });

    return { hasConflicts: true, conflicts };
  }

  private async createFetchMergeCommit(
    branch: Branch,
    mainBranch: Branch,
    forkCommitId: string,
    user: User,
  ): Promise<void> {
    const mainNewFeatures = await this.dataSource.query(
      `
      WITH main_only_commits AS (
        SELECT unnest(m.ancestor_ids) as id
        FROM commits m WHERE m.id = $1
        EXCEPT
        SELECT unnest(f.ancestor_ids) as id
        FROM commits f WHERE f.id = $2
      )
      SELECT DISTINCT ON (sf.feature_id)
        sf.id,
        sf.feature_id,
        sf.geometry_type,
        sf.geometry,
        sf.geom,
        sf.properties,
        sf.operation,
        sf.commit_id,
        sf.created_at
      FROM spatial_features sf
      WHERE sf.commit_id IN (SELECT id FROM main_only_commits)
      ORDER BY sf.feature_id, sf.created_at DESC
    `,
      [mainBranch.headCommitId, forkCommitId],
    );

    if (mainNewFeatures.length === 0) {
      await this.branchRepository.update(branch.id, {
        headCommitId: mainBranch.headCommitId,
        hasUnresolvedConflicts: false,
      });
      return;
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

      const mergeCommit = queryRunner.manager.create(Commit, {
        message: `Fetch: merge main into '${branch.name}' (main at ${mainBranch.headCommitId.slice(0, 8)})`,
        branchId: branch.id,
        authorId: user.id,
        parentCommitId: lockedBranch.headCommitId,
      });

      const savedCommit = await queryRunner.manager.save(mergeCommit);

      const featuresToAdd = mainNewFeatures.map((f: any) =>
        queryRunner.manager.create(SpatialFeature, {
          featureId: f.feature_id,
          geometryType: f.geometry_type,
          geometry: f.geometry,
          geom: f.geometry,
          properties: f.properties,
          operation: f.operation,
          commitId: savedCommit.id,
        }),
      );

      await queryRunner.manager.save(featuresToAdd);

      await queryRunner.manager.update(Branch, branch.id, {
        headCommitId: savedCommit.id,
        hasUnresolvedConflicts: false,
      });

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
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

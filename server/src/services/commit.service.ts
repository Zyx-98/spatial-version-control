import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Branch,
  Commit,
  FeatureOperation,
  SpatialFeature,
  User,
} from 'src/entities';
import { DataSource, Repository } from 'typeorm';
import { BranchService } from './branch.service';
import { CreateCommitDto } from 'src/dto/commit.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class CommitService {
  constructor(
    @InjectRepository(Commit)
    private commitRepository: Repository<Commit>,
    @InjectRepository(Branch)
    private branchRepository: Repository<Branch>,
    private branchService: BranchService,
    private dataSource: DataSource,
  ) {}

  async create(createCommitDto: CreateCommitDto, user: User): Promise<Commit> {
    const { message, branchId, features } = createCommitDto;

    const branch = await this.branchService.findOne(branchId, user);

    if (!this.branchService.canEditBranch(branch, user)) {
      throw new ForbiddenException(
        'You do not have permission to edit this branch',
      );
    }

    if (branch.hasUnresolvedConflicts) {
      throw new ForbiddenException(
        'Cannot create commit. This branch has unresolved conflicts with main. Please resolve conflicts first.',
      );
    }

    if (!branch.isMain) {
      const mainBranch = await this.branchRepository.findOne({
        where: {
          datasetId: branch.datasetId,
          isMain: true,
        },
      });

      if (mainBranch) {
        const conflicts = await this.branchService.detectConflicts(
          branch,
          mainBranch,
        );

        if (conflicts.length > 0) {
          let hasUnresolvedConflicts = true;

          if (branch.headCommitId) {
            const latestCommit = await this.commitRepository.findOne({
              where: { id: branch.headCommitId },
            });

            if (
              latestCommit?.message.includes(
                'Resolve conflicts with main branch',
              )
            ) {
              const mainLastUpdated = new Date(
                mainBranch.updatedAt || mainBranch.createdAt,
              );
              const resolutionTime = new Date(latestCommit.createdAt);

              if (mainLastUpdated <= resolutionTime) {
                hasUnresolvedConflicts = false;
              }
            }
          }

          if (hasUnresolvedConflicts) {
            await this.branchRepository.update(branchId, {
              hasUnresolvedConflicts: true,
            });

            throw new ForbiddenException(
              'Cannot create commit. This branch has conflicts with main. Please use "Fetch Main" to view and resolve conflicts first.',
            );
          }
        }
      }
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const lockedBranch = await queryRunner.manager.findOne(Branch, {
        where: { id: branchId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!lockedBranch) {
        throw new NotFoundException('Branch not found');
      }

      const expectedHeadCommitId =
        createCommitDto.expectedHeadCommitId !== undefined
          ? createCommitDto.expectedHeadCommitId
          : branch.headCommitId;

      if (lockedBranch.headCommitId !== expectedHeadCommitId) {
        throw new ConflictException(
          'Branch has been updated by another user. Please refresh and try again.',
        );
      }

      const commit = queryRunner.manager.create(Commit, {
        message,
        branchId,
        authorId: user.id,
        parentCommitId: branch.headCommitId,
      });

      const savedCommit = await queryRunner.manager.save(commit);

      const spatialFeatures = features.map((featureDto) => {
        const feature = queryRunner.manager.create(SpatialFeature, {
          featureId: featureDto.featureId || uuidv4(),
          geometryType: featureDto.geometryType,
          geometry: featureDto.geometry,
          properties: featureDto.properties,
          operation: featureDto.operation,
          commitId: savedCommit.id,
        });

        if (featureDto.geometry) {
          feature.geom = featureDto.geometry;
        }
        return feature;
      });

      await queryRunner.manager.save(spatialFeatures);

      delete (branch as any).commits;
      delete (branch as any).dataset;
      delete (branch as any).createdBy;
      branch.headCommitId = savedCommit.id;
      await queryRunner.manager.save(branch);

      await queryRunner.commitTransaction();

      return savedCommit;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(
    branchId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ commits: Commit[]; total: number }> {
    const skip = (page - 1) * limit;

    const [commits, total] = await this.commitRepository.findAndCount({
      where: { branchId },
      relations: {
        author: true,
        features: true,
      },
      order: { createdAt: 'DESC' },
      take: limit,
      skip,
    });

    return { commits, total };
  }

  async findOne(id: string): Promise<Commit> {
    const commit = await this.commitRepository.findOne({
      where: { id },
      relations: {
        features: true,
        author: true,
        branch: true,
      },
    });

    if (!commit) {
      throw new NotFoundException('Commit not found');
    }

    return commit;
  }

  async getBranchHistory(
    branchId: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<{ commits: Commit[]; total: number }> {
    return this.findAll(branchId, page, limit);
  }

  async getFeatureHistory(branchId: string, featureId: string) {
    const query = `
      SELECT
        sf.id,
        sf.feature_id as "featureId",
        sf.geometry_type as "geometryType",
        sf.geometry,
        sf.properties,
        sf.operation,
        sf.commit_id as "commitId",
        sf.created_at as "createdAt",
        sf.updated_at as "updatedAt"
      FROM spatial_features sf
      INNER JOIN commits c ON sf.commit_id = c.id
      WHERE c.branch_id = $1
        AND sf.feature_id = $2
      ORDER BY c.created_at ASC, sf.created_at ASC
    `;

    const featureHistory = await this.dataSource.query(query, [
      branchId,
      featureId,
    ]);

    return featureHistory;
  }

  async getCommitChanges(commitId: string) {
    const commit = await this.findOne(commitId);

    const updateFeatureIds = commit.features
      .filter((f) => f.operation === FeatureOperation.UPDATE)
      .map((f) => f.featureId);

    let previousStates: any[] = [];

    if (updateFeatureIds.length > 0) {
      const rawResults = await this.dataSource.query(
        `
        SELECT DISTINCT ON (sf.feature_id)
          sf.id, sf.feature_id, sf.geometry_type, sf.geometry,
          sf.properties, sf.operation, sf.commit_id, sf.created_at
        FROM spatial_features sf
        INNER JOIN commits c ON sf.commit_id = c.id
        WHERE c.branch_id = $1
          AND sf.feature_id = ANY($2)
          AND c.created_at < $3
          AND sf.operation != $4
        ORDER BY sf.feature_id, c.created_at DESC
        `,
        [
          commit.branchId,
          updateFeatureIds,
          commit.createdAt,
          FeatureOperation.DELETE,
        ],
      );

      previousStates = rawResults.map((row: any) => ({
        id: row.id,
        featureId: row.feature_id,
        geometryType: row.geometry_type,
        geometry: row.geometry,
        properties: row.properties,
        operation: row.operation,
        commitId: row.commit_id,
        createdAt: row.created_at,
      }));
    }

    const previousStateMap = new Map(
      previousStates.map((f) => [f.featureId, f]),
    );

    const updatedFeatures = commit.features
      .filter((f) => f.operation === FeatureOperation.UPDATE)
      .map((updatedFeature) => ({
        after: updatedFeature,
        before: previousStateMap.get(updatedFeature.featureId) || null,
      }));

    const changes = {
      created: commit.features.filter(
        (f) => f.operation === FeatureOperation.CREATE,
      ),
      updated: updatedFeatures,
      deleted: commit.features.filter(
        (f) => f.operation === FeatureOperation.DELETE,
      ),
      total: commit.features.length,
    };

    return {
      commit: {
        id: commit.id,
        message: commit.message,
        author: commit.author,
        createdAt: commit.createdAt,
      },
      changes,
    };
  }

  async compareBranches(sourceBranchId: string, targetBranchId: string) {
    const sourceBranch = await this.branchRepository.findOne({
      where: { id: sourceBranchId },
    });
    const targetBranch = await this.branchRepository.findOne({
      where: { id: targetBranchId },
    });

    if (!sourceBranch || !targetBranch) {
      throw new NotFoundException('Branch not found');
    }

    if (!sourceBranch.headCommitId || !targetBranch.headCommitId) {
      return {
        sourceBranchId,
        targetBranchId,
        summary: { added: 0, modified: 0, deleted: 0, unchanged: 0 },
        changes: { added: [], modified: [], deleted: [], unchanged: [] },
      };
    }

    const query = `
      WITH
      source_commit_chain AS (
        SELECT
          unnest(c.ancestor_ids) as id,
          c.created_at,
          generate_series(0, array_length(c.ancestor_ids, 1) - 1) as depth
        FROM commits c
        WHERE c.id = $1
      ),
      target_commit_chain AS (
        SELECT
          unnest(c.ancestor_ids) as id,
          c.created_at,
          generate_series(0, array_length(c.ancestor_ids, 1) - 1) as depth
        FROM commits c
        WHERE c.id = $2
      ),
      source_features AS (
        SELECT
          sf.id,
          sf.feature_id,
          sf.geometry_type,
          sf.geometry,
          sf.geom,
          sf.properties,
          sf.operation,
          sf.commit_id,
          sf.created_at,
          ROW_NUMBER() OVER (
            PARTITION BY sf.feature_id
            ORDER BY scc.created_at DESC
          ) as rn
        FROM spatial_features sf
        INNER JOIN source_commit_chain scc ON sf.commit_id = scc.id
        WHERE sf.operation != $3
      ),
      source_latest AS (
        SELECT * FROM source_features WHERE rn = 1
      ),
      target_features AS (
        SELECT
          sf.id,
          sf.feature_id,
          sf.geometry_type,
          sf.geometry,
          sf.geom,
          sf.properties,
          sf.operation,
          sf.commit_id,
          sf.created_at,
          ROW_NUMBER() OVER (
            PARTITION BY sf.feature_id
            ORDER BY tcc.created_at DESC
          ) as rn
        FROM spatial_features sf
        INNER JOIN target_commit_chain tcc ON sf.commit_id = tcc.id
        WHERE sf.operation != $3
      ),
      target_latest AS (
        SELECT * FROM target_features WHERE rn = 1
      )
      SELECT
        COALESCE(s.feature_id, t.feature_id) as feature_id,
        CASE
          WHEN s.feature_id IS NULL THEN 'deleted'
          WHEN t.feature_id IS NULL THEN 'added'
          WHEN NOT ST_Equals(s.geom, t.geom) OR s.properties::text != t.properties::text THEN 'modified'
          ELSE 'unchanged'
        END as change_type,
        s.id as source_id,
        s.geometry_type as source_geometry_type,
        s.geometry as source_geometry,
        s.properties as source_properties,
        s.operation as source_operation,
        s.commit_id as source_commit_id,
        s.created_at as source_created_at,
        t.id as target_id,
        t.geometry_type as target_geometry_type,
        t.geometry as target_geometry,
        t.properties as target_properties,
        t.operation as target_operation,
        t.commit_id as target_commit_id,
        t.created_at as target_created_at
      FROM source_latest s
      FULL OUTER JOIN target_latest t ON s.feature_id = t.feature_id
    `;

    const results = await this.dataSource.query(query, [
      sourceBranch.headCommitId,
      targetBranch.headCommitId,
      FeatureOperation.DELETE,
    ]);

    const comparison = {
      added: [] as SpatialFeature[],
      modified: [] as { source: SpatialFeature; target: SpatialFeature }[],
      deleted: [] as SpatialFeature[],
      unchanged: [] as SpatialFeature[],
    };

    for (const row of results) {
      if (row.change_type === 'added' && row.source_id) {
        comparison.added.push({
          id: row.source_id,
          featureId: row.feature_id,
          geometryType: row.source_geometry_type,
          geometry: row.source_geometry,
          properties: row.source_properties,
          operation: row.source_operation,
          commitId: row.source_commit_id,
          createdAt: row.source_created_at,
        } as SpatialFeature);
      } else if (row.change_type === 'deleted' && row.target_id) {
        comparison.deleted.push({
          id: row.target_id,
          featureId: row.feature_id,
          geometryType: row.target_geometry_type,
          geometry: row.target_geometry,
          properties: row.target_properties,
          operation: row.target_operation,
          commitId: row.target_commit_id,
          createdAt: row.target_created_at,
        } as SpatialFeature);
      } else if (
        row.change_type === 'modified' &&
        row.source_id &&
        row.target_id
      ) {
        comparison.modified.push({
          source: {
            id: row.source_id,
            featureId: row.feature_id,
            geometryType: row.source_geometry_type,
            geometry: row.source_geometry,
            properties: row.source_properties,
            operation: row.source_operation,
            commitId: row.source_commit_id,
            createdAt: row.source_created_at,
          } as SpatialFeature,
          target: {
            id: row.target_id,
            featureId: row.feature_id,
            geometryType: row.target_geometry_type,
            geometry: row.target_geometry,
            properties: row.target_properties,
            operation: row.target_operation,
            commitId: row.target_commit_id,
            createdAt: row.target_created_at,
          } as SpatialFeature,
        });
      } else if (row.change_type === 'unchanged' && row.source_id) {
        comparison.unchanged.push({
          id: row.source_id,
          featureId: row.feature_id,
          geometryType: row.source_geometry_type,
          geometry: row.source_geometry,
          properties: row.source_properties,
          operation: row.source_operation,
          commitId: row.source_commit_id,
          createdAt: row.source_created_at,
        } as SpatialFeature);
      }
    }

    return {
      sourceBranchId,
      targetBranchId,
      summary: {
        added: comparison.added.length,
        modified: comparison.modified.length,
        deleted: comparison.deleted.length,
        unchanged: comparison.unchanged.length,
      },
      changes: comparison,
    };
  }
}

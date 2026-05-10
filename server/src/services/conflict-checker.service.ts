import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  Branch,
  FeatureOperation,
  MergeRequest,
  MergeRequestStatus,
} from 'src/entities';

@Injectable()
export class ConflictCheckerService {
  private readonly logger = new Logger(ConflictCheckerService.name);

  constructor(
    @InjectRepository(MergeRequest)
    private mergeRequestRepository: Repository<MergeRequest>,
    @InjectRepository(Branch)
    private branchRepository: Repository<Branch>,
    private dataSource: DataSource,
  ) {}

  async recheckConflictsForMainBranch(mainBranchId: string): Promise<void> {
    const openMergeRequests = await this.mergeRequestRepository.find({
      where: {
        targetBranchId: mainBranchId,
        status: MergeRequestStatus.OPEN,
      },
      relations: ['sourceBranch'],
    });

    if (openMergeRequests.length === 0) {
      this.logger.debug('No open MRs to re-check');
      return;
    }

    const targetBranch = await this.branchRepository.findOne({
      where: { id: mainBranchId },
    });

    if (!targetBranch || !targetBranch.headCommitId) {
      return;
    }

    for (const mr of openMergeRequests) {
      try {
        const conflicts = await this.detectConflictsBetweenBranches(
          mr.sourceBranch,
          targetBranch,
        );

        const hasConflicts = conflicts.length > 0;

        if (mr.hasConflicts !== hasConflicts || hasConflicts) {
          const update: Partial<MergeRequest> = { hasConflicts, conflicts };

          if (hasConflicts) {
            if (mr.status === MergeRequestStatus.APPROVED) {
              update.status = MergeRequestStatus.OPEN;
              this.logger.warn(
                `MR ${mr.id} was APPROVED but has new conflicts after merge — reset to OPEN`,
              );
            }

            if (Array.isArray(mr.conflicts)) {
              update.conflicts = conflicts.map((newConflict: any) => {
                const stale = (mr.conflicts as any[]).find(
                  (c) => c.featureId === newConflict.featureId,
                );
                if (
                  stale?.resolved &&
                  stale.conflictType === newConflict.conflictType
                ) {
                  return {
                    ...newConflict,
                    resolved: false,
                    resolution: null,
                    resolutionData: null,
                  };
                }
                return newConflict;
              });
            }
          }

          await this.mergeRequestRepository.update(mr.id, update);
        }
      } catch (error: any) {
        this.logger.error(
          `Failed to re-check conflicts for MR ${mr.id}: ${error.message}`,
        );
      }
    }
  }

  private async detectConflictsBetweenBranches(
    sourceBranch: Branch,
    targetBranch: Branch,
  ): Promise<any[]> {
    if (!sourceBranch.headCommitId || !targetBranch.headCommitId) {
      return [];
    }

    const forkCommitId = sourceBranch.forkCommitId;

    if (!forkCommitId) {
      return [];
    }

    if (targetBranch.headCommitId === forkCommitId) {
      return [];
    }

    const query = `
      WITH
      source_delta AS (
        SELECT unnest(ancestor_ids) AS id
        FROM commits WHERE id = $1
        EXCEPT
        SELECT unnest(ancestor_ids) AS id
        FROM commits WHERE id = $3
      ),
      target_delta AS (
        SELECT unnest(ancestor_ids) AS id
        FROM commits WHERE id = $2
        EXCEPT
        SELECT unnest(ancestor_ids) AS id
        FROM commits WHERE id = $3
      ),
      source_features AS (
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
        WHERE sf.commit_id IN (SELECT id FROM source_delta)
        ORDER BY sf.feature_id, sf.created_at DESC
      ),
      target_features AS (
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
        WHERE sf.commit_id IN (SELECT id FROM target_delta)
        ORDER BY sf.feature_id, sf.created_at DESC
      )
      SELECT
        COALESCE(sf.feature_id, tf.feature_id) AS "featureId",
        CASE
          WHEN sf.feature_id IS NOT NULL AND tf.feature_id IS NOT NULL
               AND (sf.operation = '${FeatureOperation.DELETE}' OR tf.operation = '${FeatureOperation.DELETE}')
            THEN 'modified_deleted'
          ELSE 'both_modified'
        END AS "conflictType",
        CASE WHEN sf.feature_id IS NOT NULL THEN jsonb_build_object(
          'id', sf.id,
          'featureId', sf.feature_id,
          'geometryType', sf.geometry_type,
          'geometry', sf.geometry,
          'properties', sf.properties,
          'operation', sf.operation,
          'commitId', sf.commit_id,
          'createdAt', sf.created_at
        ) END AS "branchVersion",
        CASE WHEN tf.feature_id IS NOT NULL THEN jsonb_build_object(
          'id', tf.id,
          'featureId', tf.feature_id,
          'geometryType', tf.geometry_type,
          'geometry', tf.geometry,
          'properties', tf.properties,
          'operation', tf.operation,
          'commitId', tf.commit_id,
          'createdAt', tf.created_at
        ) END AS "mainVersion"
      FROM source_features sf
      INNER JOIN target_features tf ON sf.feature_id = tf.feature_id
      WHERE (
        (
          sf.operation != '${FeatureOperation.DELETE}'
          AND tf.operation != '${FeatureOperation.DELETE}'
          AND (
            NOT ST_Equals(sf.geom, tf.geom)
            OR sf.properties::text != tf.properties::text
          )
        )
        OR
        (
          sf.operation = '${FeatureOperation.DELETE}'
          AND tf.operation != '${FeatureOperation.DELETE}'
        )
        OR
        (
          sf.operation != '${FeatureOperation.DELETE}'
          AND tf.operation = '${FeatureOperation.DELETE}'
        )
      )
    `;

    return this.dataSource.query(query, [
      sourceBranch.headCommitId,
      targetBranch.headCommitId,
      forkCommitId,
    ]);
  }
}

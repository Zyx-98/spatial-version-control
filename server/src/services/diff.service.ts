import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Branch, FeatureOperation } from 'src/entities';

export interface DiffSummary {
  added: number;
  modified: number;
  deleted: number;
  totalChanges: number;
  affectedArea: {
    minLng: number;
    minLat: number;
    maxLng: number;
    maxLat: number;
  } | null;
}

@Injectable()
export class DiffService {
  constructor(
    @InjectRepository(Branch)
    private branchRepository: Repository<Branch>,
    private dataSource: DataSource,
  ) {}

  async getDiffSummary(
    sourceBranchId: string,
    targetBranchId: string,
    bbox?: string,
  ): Promise<DiffSummary> {
    const sourceBranch = await this.branchRepository.findOne({
      where: { id: sourceBranchId },
    });
    const targetBranch = await this.branchRepository.findOne({
      where: { id: targetBranchId },
    });

    if (!sourceBranch || !targetBranch) {
      throw new NotFoundException('Branch not found');
    }

    let bboxParams: number[] = [];
    let bboxFilter = '1=1';
    if (bbox) {
      const [minLng, minLat, maxLng, maxLat] = bbox.split(',').map(parseFloat);
      if (![minLng, minLat, maxLng, maxLat].some(isNaN)) {
        bboxParams = [minLng, minLat, maxLng, maxLat];
        bboxFilter = `COALESCE(s.geom, t.geom) && ST_MakeEnvelope($3, $4, $5, $6, 4326)`;
      }
    }

    const query = `
      WITH RECURSIVE
      source_commit_chain AS (
        SELECT id, parent_commit_id, created_at, 0 as depth
        FROM commits
        WHERE id = $1

        UNION ALL

        SELECT c.id, c.parent_commit_id, c.created_at, scc.depth + 1
        FROM commits c
        INNER JOIN source_commit_chain scc ON c.id = scc.parent_commit_id
        WHERE scc.depth < 1000
      ),
      target_commit_chain AS (
        SELECT id, parent_commit_id, created_at, 0 as depth
        FROM commits
        WHERE id = $2

        UNION ALL

        SELECT c.id, c.parent_commit_id, c.created_at, tcc.depth + 1
        FROM commits c
        INNER JOIN target_commit_chain tcc ON c.id = tcc.parent_commit_id
        WHERE tcc.depth < 1000
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
          ROW_NUMBER() OVER (
            PARTITION BY sf.feature_id
            ORDER BY scc.created_at DESC
          ) as rn
        FROM spatial_features sf
        INNER JOIN source_commit_chain scc ON sf.commit_id = scc.id
        WHERE sf.operation != $7
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
          ROW_NUMBER() OVER (
            PARTITION BY sf.feature_id
            ORDER BY tcc.created_at DESC
          ) as rn
        FROM spatial_features sf
        INNER JOIN target_commit_chain tcc ON sf.commit_id = tcc.id
        WHERE sf.operation != $7
      ),
      target_latest AS (
        SELECT * FROM target_features WHERE rn = 1
      ),
      diff_analysis AS (
        SELECT
          COALESCE(s.feature_id, t.feature_id) as feature_id,
          CASE
            WHEN s.feature_id IS NULL THEN 'deleted'
            WHEN t.feature_id IS NULL THEN 'added'
            WHEN NOT ST_Equals(s.geom, t.geom) OR s.properties::text != t.properties::text THEN 'modified'
            ELSE 'unchanged'
          END as change_type,
          COALESCE(s.geom, t.geom) as geom
        FROM source_latest s
        FULL OUTER JOIN target_latest t ON s.feature_id = t.feature_id
        WHERE ${bboxFilter}
      )
      SELECT
        COUNT(*) FILTER (WHERE change_type = 'added') as added,
        COUNT(*) FILTER (WHERE change_type = 'modified') as modified,
        COUNT(*) FILTER (WHERE change_type = 'deleted') as deleted,
        ST_XMin(ST_Extent(geom)) as min_lng,
        ST_YMin(ST_Extent(geom)) as min_lat,
        ST_XMax(ST_Extent(geom)) as max_lng,
        ST_YMax(ST_Extent(geom)) as max_lat
      FROM diff_analysis
      WHERE change_type != 'unchanged'
    `;

    const params = [
      sourceBranch.headCommitId,
      targetBranch.headCommitId,
      ...bboxParams,
      FeatureOperation.DELETE,
    ];

    const result = await this.dataSource.query(query, params);
    const row = result[0];

    return {
      added: parseInt(row.added) || 0,
      modified: parseInt(row.modified) || 0,
      deleted: parseInt(row.deleted) || 0,
      totalChanges:
        (parseInt(row.added) || 0) +
        (parseInt(row.modified) || 0) +
        (parseInt(row.deleted) || 0),
      affectedArea: row.min_lng
        ? {
            minLng: parseFloat(row.min_lng),
            minLat: parseFloat(row.min_lat),
            maxLng: parseFloat(row.max_lng),
            maxLat: parseFloat(row.max_lat),
          }
        : null,
    };
  }
}

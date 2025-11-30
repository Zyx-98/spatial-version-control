import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Branch, Commit, FeatureOperation } from 'src/entities';

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
    @InjectRepository(Commit)
    private commitRepository: Repository<Commit>,
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

    const bboxFilter = bbox ? this.buildBboxFilter(bbox) : '1=1';

    const query = `
      WITH source_features AS (
        ${this.buildLatestFeaturesQuery(sourceBranch.headCommitId)}
      ),
      target_features AS (
        ${this.buildLatestFeaturesQuery(targetBranch.headCommitId)}
      ),
      diff_analysis AS (
        SELECT
          COALESCE(s.feature_id, t.feature_id) as feature_id,
          CASE
            WHEN s.feature_id IS NULL THEN 'deleted'
            WHEN t.feature_id IS NULL THEN 'added'
            WHEN s.geometry::text != t.geometry::text THEN 'modified'
            ELSE 'unchanged'
          END as change_type,
          COALESCE(s.geom, t.geom) as geom
        FROM source_features s
        FULL OUTER JOIN target_features t ON s.feature_id = t.feature_id
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

    const result = await this.dataSource.query(query);
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

  private buildLatestFeaturesQuery(headCommitId: string | null): string {
    if (!headCommitId) {
      return `SELECT NULL as id, NULL as feature_id, NULL as geometry, NULL as geom WHERE false`;
    }

    return `
      WITH RECURSIVE commit_chain AS (
        SELECT id, parent_commit_id, 1 as depth
        FROM commits
        WHERE id = '${headCommitId}'

        UNION ALL

        SELECT c.id, c.parent_commit_id, cc.depth + 1
        FROM commits c
        INNER JOIN commit_chain cc ON c.id = cc.parent_commit_id
        WHERE cc.depth < 1000
      ),
      all_features AS (
        SELECT
          sf.*,
          cc.depth,
          ROW_NUMBER() OVER (
            PARTITION BY sf.feature_id
            ORDER BY cc.depth ASC
          ) as rn
        FROM spatial_features sf
        INNER JOIN commit_chain cc ON sf.commit_id = cc.id
      )
      SELECT
        id,
        feature_id,
        geometry_type,
        geometry,
        geom,
        properties,
        operation
      FROM all_features
      WHERE rn = 1 AND operation != '${FeatureOperation.DELETE}'
    `;
  }

  private buildBboxFilter(bbox: string): string {
    const [minLng, minLat, maxLng, maxLat] = bbox.split(',').map(parseFloat);

    if ([minLng, minLat, maxLng, maxLat].some(isNaN)) {
      return '1=1';
    }

    return `
      COALESCE(s.geom, t.geom) && ST_MakeEnvelope(
        ${minLng}, ${minLat}, ${maxLng}, ${maxLat}, 4326
      )
    `;
  }
}

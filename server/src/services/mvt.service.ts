import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class MvtService {
  constructor(private dataSource: DataSource) {}

  async generateBranchTile(
    branchId: string,
    z: number,
    x: number,
    y: number,
    layerName: string = 'features',
  ): Promise<Buffer> {
    const query = `
      WITH RECURSIVE commit_chain AS (
        SELECT c.id, c.parent_commit_id, c.created_at, 0 as depth
        FROM commits c
        JOIN branches b ON c.branch_id = b.id
        WHERE b.id = $1

        UNION ALL

        SELECT c.id, c.parent_commit_id, c.created_at, cc.depth + 1
        FROM commits c
        INNER JOIN commit_chain cc ON c.id = cc.parent_commit_id
        WHERE cc.depth < 1000
      ),
      features_with_order AS (
        SELECT
          sf.id,
          sf.feature_id,
          sf.geometry_type,
          sf.properties,
          sf.operation,
          sf.geom,
          sf.commit_id,
          ROW_NUMBER() OVER (
            PARTITION BY sf.feature_id
            ORDER BY cc.created_at DESC, sf.created_at DESC
          ) as rn
        FROM spatial_features sf
        INNER JOIN commit_chain cc ON sf.commit_id = cc.id
        WHERE sf.operation != 'delete'
          AND sf.geom IS NOT NULL
      ),
      latest_features AS (
        SELECT
          id,
          feature_id,
          geometry_type,
          properties,
          operation,
          geom,
          commit_id
        FROM features_with_order
        WHERE rn = 1
      ),
      mvt_features AS (
        SELECT
          feature_id,
          geometry_type,
          properties,
          operation,
          commit_id,
          ST_AsMVTGeom(
            ST_Transform(geom, 3857),
            ST_TileEnvelope($2, $3, $4),
            4096,
            256,
            true
          ) AS geom
        FROM latest_features
        WHERE geom IS NOT NULL
          AND ST_Intersects(
            geom,
            ST_Transform(ST_TileEnvelope($2, $3, $4), 4326)
          )
      )
      SELECT ST_AsMVT(mvt_features, $5, 4096, 'geom') as mvt
      FROM mvt_features;
    `;

    const result = await this.dataSource.query(query, [
      branchId,
      z,
      x,
      y,
      layerName,
    ]);

    return result[0]?.mvt || Buffer.alloc(0);
  }

  async generateConflictTile(
    branchId: string,
    mainBranchId: string,
    z: number,
    x: number,
    y: number,
  ): Promise<{ main: Buffer; branch: Buffer }> {
    const [mainTile, branchTile] = await Promise.all([
      this.generateBranchTile(mainBranchId, z, x, y, 'main'),
      this.generateBranchTile(branchId, z, x, y, 'branch'),
    ]);

    return {
      main: mainTile,
      branch: branchTile,
    };
  }

  async generateFeaturesTile(
    featureIds: string[],
    branchId: string,
    z: number,
    x: number,
    y: number,
    layerName: string = 'features',
  ): Promise<Buffer> {
    if (featureIds.length === 0) {
      return Buffer.alloc(0);
    }

    const query = `
      WITH RECURSIVE commit_chain AS (
        SELECT id, parent_commit_id, created_at, 0 as depth
        FROM commits
        WHERE branch_id = $1

        UNION ALL

        SELECT c.id, c.parent_commit_id, c.created_at, cc.depth + 1
        FROM commits c
        INNER JOIN commit_chain cc ON c.id = cc.parent_commit_id
        WHERE cc.depth < 1000
      ),
      features_with_order AS (
        SELECT
          sf.id,
          sf.feature_id,
          sf.geometry_type,
          sf.properties,
          sf.operation,
          sf.geom,
          sf.commit_id,
          ROW_NUMBER() OVER (
            PARTITION BY sf.feature_id
            ORDER BY cc.created_at DESC, sf.created_at DESC
          ) as rn
        FROM spatial_features sf
        INNER JOIN commit_chain cc ON sf.commit_id = cc.id
        WHERE sf.feature_id = ANY($2::uuid[])
          AND sf.operation != 'delete'
          AND sf.geom IS NOT NULL
      ),
      target_features AS (
        SELECT
          id,
          feature_id,
          geometry_type,
          properties,
          operation,
          geom,
          commit_id
        FROM features_with_order
        WHERE rn = 1
      ),
      mvt_features AS (
        SELECT
          feature_id,
          geometry_type,
          properties,
          operation,
          commit_id,
          ST_AsMVTGeom(
            ST_Transform(geom, 3857),
            ST_TileEnvelope($3, $4, $5),
            4096,
            256,
            true
          ) AS geom
        FROM target_features
        WHERE geom IS NOT NULL
          AND ST_Intersects(
            geom,
            ST_Transform(ST_TileEnvelope($3, $4, $5), 4326)
          )
      )
      SELECT ST_AsMVT(mvt_features, $6, 4096, 'geom') as mvt
      FROM mvt_features;
    `;

    const result = await this.dataSource.query(query, [
      branchId,
      featureIds,
      z,
      x,
      y,
      layerName,
    ]);

    return result[0]?.mvt || Buffer.alloc(0);
  }

  async getBranchBounds(branchId: string): Promise<number[] | null> {
    const query = `
      WITH latest_features AS (
        SELECT DISTINCT ON (sf.feature_id)
          sf.geom
        FROM spatial_features sf
        JOIN commits c ON sf.commit_id = c.id
        WHERE c.branch_id = $1
          AND sf.operation != 'delete'
          AND sf.geom IS NOT NULL
        ORDER BY sf.feature_id, c.created_at DESC, sf.created_at DESC
      )
      SELECT
        ST_XMin(extent) as min_lng,
        ST_YMin(extent) as min_lat,
        ST_XMax(extent) as max_lng,
        ST_YMax(extent) as max_lat
      FROM (
        SELECT ST_Extent(geom) as extent
        FROM latest_features
      ) bounds;
    `;

    const result = await this.dataSource.query(query, [branchId]);

    if (result[0] && result[0].min_lng !== null) {
      return [
        result[0].min_lng,
        result[0].min_lat,
        result[0].max_lng,
        result[0].max_lat,
      ];
    }

    return null;
  }

  async generateDiffTile(
    sourceBranchId: string,
    targetBranchId: string,
    z: number,
    x: number,
    y: number,
    layerName: string = 'diff',
  ): Promise<Buffer> {
    const query = `
      WITH RECURSIVE
      source_commits AS (
        SELECT id, parent_commit_id, 1 as depth
        FROM commits
        WHERE branch_id = $1

        UNION ALL

        SELECT c.id, c.parent_commit_id, sc.depth + 1
        FROM commits c
        INNER JOIN source_commits sc ON c.id = sc.parent_commit_id
        WHERE sc.depth < 1000
      ),
      target_commits AS (
        SELECT id, parent_commit_id, 1 as depth
        FROM commits
        WHERE branch_id = $2

        UNION ALL

        SELECT c.id, c.parent_commit_id, tc.depth + 1
        FROM commits c
        INNER JOIN target_commits tc ON c.id = tc.parent_commit_id
        WHERE tc.depth < 1000
      ),
      source_features AS (
        SELECT
          sf.feature_id,
          sf.geometry_type,
          sf.properties,
          sf.geom,
          ROW_NUMBER() OVER (PARTITION BY sf.feature_id ORDER BY sc.depth ASC) as rn
        FROM spatial_features sf
        INNER JOIN source_commits sc ON sf.commit_id = sc.id
        WHERE sf.operation != 'delete'
      ),
      source_latest AS (
        SELECT * FROM source_features WHERE rn = 1
      ),
      target_features AS (
        SELECT
          sf.feature_id,
          sf.geometry_type,
          sf.properties,
          sf.geom,
          ROW_NUMBER() OVER (PARTITION BY sf.feature_id ORDER BY tc.depth ASC) as rn
        FROM spatial_features sf
        INNER JOIN target_commits tc ON sf.commit_id = tc.id
        WHERE sf.operation != 'delete'
      ),
      target_latest AS (
        SELECT * FROM target_features WHERE rn = 1
      ),
      diff_features AS (
        SELECT
          COALESCE(s.feature_id, t.feature_id) as feature_id,
          COALESCE(s.geometry_type, t.geometry_type) as geometry_type,
          COALESCE(s.properties, t.properties) as properties,
          COALESCE(s.geom, t.geom) as geom,
          CASE
            WHEN s.feature_id IS NULL THEN 'deleted'
            WHEN t.feature_id IS NULL THEN 'added'
            WHEN s.geom::text != t.geom::text OR s.properties::text != t.properties::text THEN 'modified'
            ELSE 'unchanged'
          END as change_type
        FROM source_latest s
        FULL OUTER JOIN target_latest t ON s.feature_id = t.feature_id
      ),
      mvt_features AS (
        SELECT
          feature_id,
          geometry_type,
          properties || jsonb_build_object('change_type', change_type) as properties,
          change_type,
          ST_AsMVTGeom(
            ST_Transform(geom, 3857),
            ST_TileEnvelope($3, $4, $5),
            4096,
            256,
            true
          ) AS geom
        FROM diff_features
        WHERE change_type != 'unchanged'
          AND geom IS NOT NULL
          AND ST_Intersects(
            geom,
            ST_Transform(ST_TileEnvelope($3, $4, $5), 4326)
          )
      )
      SELECT ST_AsMVT(mvt_features, $6, 4096, 'geom') as mvt
      FROM mvt_features;
    `;

    const result = await this.dataSource.query(query, [
      sourceBranchId,
      targetBranchId,
      z,
      x,
      y,
      layerName,
    ]);

    return result[0]?.mvt || Buffer.alloc(0);
  }
}

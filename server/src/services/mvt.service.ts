import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Branch } from 'src/entities';
import { DataSource, Repository } from 'typeorm';

@Injectable()
export class MvtService {
  constructor(
    private dataSource: DataSource,
    @InjectRepository(Branch)
    private branchRepository: Repository<Branch>,
  ) {}

  async generateBranchTile(
    branchId: string,
    z: number,
    x: number,
    y: number,
    layerName: string = 'features',
  ): Promise<Buffer> {
    const simplificationTolerance = this.getSimplificationTolerance(z);

    const branchCheck = await this.branchRepository.findOneOrFail({
      where: { id: branchId },
    });
    const isMain = branchCheck.isMain;

    const query = isMain
      ? `
      WITH mvt_features AS (
        SELECT
          feature_id,
          geometry_type,
          properties,
          operation,
          commit_id,
          ST_AsMVTGeom(
            CASE
              WHEN $5 > 0 THEN ST_SimplifyPreserveTopology(geom_3857, $5)
              ELSE geom_3857
            END,
            ST_TileEnvelope($1, $2, $3),
            4096,
            256,
            true
          ) AS geom
        FROM main_branch_latest_features
        WHERE geom_3857 IS NOT NULL
          AND ST_Intersects(
            geom_3857,
            ST_TileEnvelope($1, $2, $3)
          )
      )
      SELECT ST_AsMVT(mvt_features, $4, 4096, 'geom') as mvt
      FROM mvt_features;
    `
      : `
      WITH commit_chain AS (
        SELECT
          unnest(c.ancestor_ids) as id,
          c.created_at,
          generate_series(0, array_length(c.ancestor_ids, 1) - 1) as depth
        FROM branches b
        INNER JOIN commits c ON b.head_commit_id = c.id
        WHERE b.id = $1
          AND b.head_commit_id IS NOT NULL
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
          AND ST_IsValid(sf.geom)
      ),
      latest_features AS (
        SELECT
          id,
          feature_id,
          geometry_type,
          properties,
          operation,
          ST_MakeValid(ST_Transform(geom, 3857)) as geom_3857,
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
            CASE
              WHEN $6 > 0 THEN ST_SimplifyPreserveTopology(geom_3857, $6)
              ELSE geom_3857
            END,
            ST_TileEnvelope($2, $3, $4),
            4096,
            256,
            true
          ) AS geom
        FROM latest_features
        WHERE geom_3857 IS NOT NULL
          AND ST_Intersects(
            geom_3857,
            ST_TileEnvelope($2, $3, $4)
          )
      )
      SELECT ST_AsMVT(mvt_features, $5, 4096, 'geom') as mvt
      FROM mvt_features;
    `;

    const params = isMain
      ? [z, x, y, layerName, simplificationTolerance]
      : [branchId, z, x, y, layerName, simplificationTolerance];

    const result = await this.dataSource.query(query, params);

    return result[0]?.mvt || Buffer.alloc(0);
  }

  private getSimplificationTolerance(zoom: number): number {
    if (zoom < 6) {
      return 100; // Very simplified for low zoom (overview)
    } else if (zoom < 9) {
      return 10; // Moderately simplified
    } else if (zoom < 12) {
      return 1; // Slightly simplified
    } else {
      return 0; // Full detail for high zoom
    }
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

    const branchCheck = await this.dataSource.query(
      'SELECT is_main FROM branches WHERE id = $1',
      [branchId],
    );
    const isMainBranch = branchCheck[0]?.is_main;

    const query = isMainBranch
      ? `
      WITH mvt_features AS (
        SELECT
          feature_id,
          geometry_type,
          properties,
          operation,
          commit_id,
          ST_AsMVTGeom(
            geom_3857,
            ST_TileEnvelope($2, $3, $4),
            4096,
            256,
            true
          ) AS geom
        FROM main_branch_latest_features
        WHERE feature_id = ANY($1::uuid[])
          AND geom_3857 IS NOT NULL
          AND ST_Intersects(
            geom_3857,
            ST_TileEnvelope($2, $3, $4)
          )
      )
      SELECT ST_AsMVT(mvt_features, $5, 4096, 'geom') as mvt
      FROM mvt_features;
    `
      : `
      WITH commit_chain AS (
        SELECT
          unnest(c.ancestor_ids) as id,
          c.created_at,
          generate_series(0, array_length(c.ancestor_ids, 1) - 1) as depth
        FROM branches b
        INNER JOIN commits c ON b.head_commit_id = c.id
        WHERE b.id = $1
          AND b.head_commit_id IS NOT NULL
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

    const params = isMainBranch
      ? [featureIds, z, x, y, layerName]
      : [branchId, featureIds, z, x, y, layerName];

    const result = await this.dataSource.query(query, params);

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
    const tileBounds4326 = `ST_Transform(ST_TileEnvelope($3, $4, $5), 4326)`;
    const tileBounds3857 = `ST_TileEnvelope($3, $4, $5)`;

    const query = `
      WITH
      source_commits AS (
        SELECT
          unnest(c.ancestor_ids) as id,
          c.created_at,
          generate_series(0, array_length(c.ancestor_ids, 1) - 1) as depth
        FROM branches b
        INNER JOIN commits c ON b.head_commit_id = c.id
        WHERE b.id = $1
          AND b.head_commit_id IS NOT NULL
      ),
      target_commits AS (
        SELECT
          unnest(c.ancestor_ids) as id,
          c.created_at,
          generate_series(0, array_length(c.ancestor_ids, 1) - 1) as depth
        FROM branches b
        INNER JOIN commits c ON b.head_commit_id = c.id
        WHERE b.id = $2
          AND b.head_commit_id IS NOT NULL
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
          AND sf.geom IS NOT NULL
          AND ST_IsValid(sf.geom)
          AND ST_Intersects(sf.geom, ${tileBounds4326})
      ),
      source_latest AS (
        SELECT
          feature_id,
          geometry_type,
          properties,
          ST_MakeValid(ST_Transform(geom, 3857)) as geom_3857,
          ST_AsBinary(geom) as geom_binary
        FROM source_features
        WHERE rn = 1
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
          AND sf.geom IS NOT NULL
          AND ST_IsValid(sf.geom)
          AND ST_Intersects(sf.geom, ${tileBounds4326})
      ),
      target_latest AS (
        SELECT
          feature_id,
          geometry_type,
          properties,
          ST_MakeValid(ST_Transform(geom, 3857)) as geom_3857,
          ST_AsBinary(geom) as geom_binary
        FROM target_features
        WHERE rn = 1
      ),
      diff_features AS (
        SELECT
          COALESCE(s.feature_id, t.feature_id) as feature_id,
          COALESCE(s.geometry_type, t.geometry_type) as geometry_type,
          COALESCE(s.properties, t.properties) as properties,
          COALESCE(s.geom_3857, t.geom_3857) as geom_3857,
          CASE
            WHEN s.feature_id IS NULL THEN 'deleted'
            WHEN t.feature_id IS NULL THEN 'added'
            WHEN s.geom_binary != t.geom_binary OR s.properties::text != t.properties::text THEN 'modified'
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
            geom_3857,
            ${tileBounds3857},
            4096,
            256,
            true
          ) AS geom
        FROM diff_features
        WHERE change_type != 'unchanged'
          AND geom_3857 IS NOT NULL
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

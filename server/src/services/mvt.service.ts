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
      WITH latest_features AS (
        SELECT DISTINCT ON (sf.feature_id)
          sf.id,
          sf.feature_id,
          sf.geometry_type,
          sf.properties,
          sf.operation,
          sf.geom,
          sf.commit_id
        FROM spatial_features sf
        JOIN commits c ON sf.commit_id = c.id
        JOIN branches b ON c.branch_id = b.id
        WHERE b.id = $1
          AND sf.operation != 'delete'
        ORDER BY sf.feature_id, c.created_at DESC, sf.created_at DESC
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
    // Generate tiles for both branches
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
      WITH target_features AS (
        SELECT DISTINCT ON (sf.feature_id)
          sf.id,
          sf.feature_id,
          sf.geometry_type,
          sf.properties,
          sf.operation,
          sf.geom,
          sf.commit_id
        FROM spatial_features sf
        JOIN commits c ON sf.commit_id = c.id
        WHERE c.branch_id = $1
          AND sf.feature_id = ANY($2::uuid[])
          AND sf.operation != 'delete'
        ORDER BY sf.feature_id, c.created_at DESC, sf.created_at DESC
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
}

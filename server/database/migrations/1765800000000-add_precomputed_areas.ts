import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPrecomputedAreas1765800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP MATERIALIZED VIEW IF EXISTS main_branch_latest_features;
    `);

    await queryRunner.query(`
      CREATE MATERIALIZED VIEW main_branch_latest_features AS
      WITH latest_commits AS (
        SELECT
          c.id,
          c.branch_id,
          c.created_at,
          b.is_main
        FROM commits c
        JOIN branches b ON c.branch_id = b.id
        WHERE b.is_main = true
      )
      SELECT DISTINCT ON (sf.feature_id)
        sf.id,
        sf.feature_id,
        sf.geometry_type,
        sf.geometry,
        sf.properties,
        sf.operation,
        sf.geom,
        -- Pre-validated Web Mercator geometry
        ST_MakeValid(ST_Transform(sf.geom, 3857)) as geom_3857,
        -- Pre-simplified geometries for different zoom level ranges
        ST_SimplifyPreserveTopology(ST_MakeValid(ST_Transform(sf.geom, 3857)), 100) as geom_3857_z0_5,
        ST_SimplifyPreserveTopology(ST_MakeValid(ST_Transform(sf.geom, 3857)), 10) as geom_3857_z6_8,
        ST_SimplifyPreserveTopology(ST_MakeValid(ST_Transform(sf.geom, 3857)), 1) as geom_3857_z9_11,
        -- Pre-computed areas (in square meters) for zoom-level filtering
        ST_Area(ST_MakeValid(ST_Transform(sf.geom, 3857))) as area_3857,
        ST_Area(ST_SimplifyPreserveTopology(ST_MakeValid(ST_Transform(sf.geom, 3857)), 100)) as area_3857_z0_5,
        ST_Area(ST_SimplifyPreserveTopology(ST_MakeValid(ST_Transform(sf.geom, 3857)), 10)) as area_3857_z6_8,
        ST_Area(ST_SimplifyPreserveTopology(ST_MakeValid(ST_Transform(sf.geom, 3857)), 1)) as area_3857_z9_11,
        -- Geometry bounds for spatial optimization
        ST_XMin(ST_Envelope(ST_Transform(sf.geom, 3857))) as min_x,
        ST_YMin(ST_Envelope(ST_Transform(sf.geom, 3857))) as min_y,
        ST_XMax(ST_Envelope(ST_Transform(sf.geom, 3857))) as max_x,
        ST_YMax(ST_Envelope(ST_Transform(sf.geom, 3857))) as max_y,
        sf.commit_id,
        sf.created_at
      FROM spatial_features sf
      INNER JOIN latest_commits lc ON sf.commit_id = lc.id
      WHERE sf.operation != 'delete'
        AND sf.geom IS NOT NULL
        AND ST_IsValid(sf.geom)
      ORDER BY sf.feature_id, lc.created_at DESC, sf.created_at DESC;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_main_mv_feature_id
      ON main_branch_latest_features (feature_id);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_main_mv_geom_3857_gist
      ON main_branch_latest_features USING GIST (geom_3857)
      WHERE geom_3857 IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX idx_main_mv_geom_3857_z0_5_gist
      ON main_branch_latest_features USING GIST (geom_3857_z0_5)
      WHERE geom_3857_z0_5 IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX idx_main_mv_geom_3857_z6_8_gist
      ON main_branch_latest_features USING GIST (geom_3857_z6_8)
      WHERE geom_3857_z6_8 IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX idx_main_mv_geom_3857_z9_11_gist
      ON main_branch_latest_features USING GIST (geom_3857_z9_11)
      WHERE geom_3857_z9_11 IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX idx_main_mv_area_3857_z0_5
      ON main_branch_latest_features (area_3857_z0_5)
      WHERE area_3857_z0_5 IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX idx_main_mv_area_3857_z6_8
      ON main_branch_latest_features (area_3857_z6_8)
      WHERE area_3857_z6_8 IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX idx_main_mv_area_3857_z9_11
      ON main_branch_latest_features (area_3857_z9_11)
      WHERE area_3857_z9_11 IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX idx_main_mv_geometry_type
      ON main_branch_latest_features (geometry_type);
    `);

    await queryRunner.query(`ANALYZE main_branch_latest_features;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP MATERIALIZED VIEW IF EXISTS main_branch_latest_features;
    `);

    await queryRunner.query(`
      CREATE MATERIALIZED VIEW main_branch_latest_features AS
      WITH latest_commits AS (
        SELECT
          c.id,
          c.branch_id,
          c.created_at,
          b.is_main
        FROM commits c
        JOIN branches b ON c.branch_id = b.id
        WHERE b.is_main = true
      )
      SELECT DISTINCT ON (sf.feature_id)
        sf.id,
        sf.feature_id,
        sf.geometry_type,
        sf.geometry,
        sf.properties,
        sf.operation,
        sf.geom,
        ST_MakeValid(ST_Transform(sf.geom, 3857)) as geom_3857,
        ST_SimplifyPreserveTopology(ST_MakeValid(ST_Transform(sf.geom, 3857)), 100) as geom_3857_z0_5,
        ST_SimplifyPreserveTopology(ST_MakeValid(ST_Transform(sf.geom, 3857)), 10) as geom_3857_z6_8,
        ST_SimplifyPreserveTopology(ST_MakeValid(ST_Transform(sf.geom, 3857)), 1) as geom_3857_z9_11,
        ST_XMin(ST_Envelope(ST_Transform(sf.geom, 3857))) as min_x,
        ST_YMin(ST_Envelope(ST_Transform(sf.geom, 3857))) as min_y,
        ST_XMax(ST_Envelope(ST_Transform(sf.geom, 3857))) as max_x,
        ST_YMax(ST_Envelope(ST_Transform(sf.geom, 3857))) as max_y,
        sf.commit_id,
        sf.created_at
      FROM spatial_features sf
      INNER JOIN latest_commits lc ON sf.commit_id = lc.id
      WHERE sf.operation != 'delete'
        AND sf.geom IS NOT NULL
        AND ST_IsValid(sf.geom)
      ORDER BY sf.feature_id, lc.created_at DESC, sf.created_at DESC;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_main_mv_feature_id
      ON main_branch_latest_features (feature_id);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_main_mv_geom_3857_gist
      ON main_branch_latest_features USING GIST (geom_3857)
      WHERE geom_3857 IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX idx_main_mv_geom_3857_z0_5_gist
      ON main_branch_latest_features USING GIST (geom_3857_z0_5)
      WHERE geom_3857_z0_5 IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX idx_main_mv_geom_3857_z6_8_gist
      ON main_branch_latest_features USING GIST (geom_3857_z6_8)
      WHERE geom_3857_z6_8 IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX idx_main_mv_geom_3857_z9_11_gist
      ON main_branch_latest_features USING GIST (geom_3857_z9_11)
      WHERE geom_3857_z9_11 IS NOT NULL;
    `);

    await queryRunner.query(`ANALYZE main_branch_latest_features;`);
  }
}

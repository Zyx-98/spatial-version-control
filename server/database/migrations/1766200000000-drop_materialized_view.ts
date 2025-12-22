import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropMaterializedView1766200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trigger_refresh_main_branch_view ON commits;
    `);

    await queryRunner.query(`
      DROP FUNCTION IF EXISTS refresh_main_branch_view();
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_main_branch_features_geom;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_main_branch_features_feature_id;
    `);

    await queryRunner.query(`
      DROP MATERIALIZED VIEW IF EXISTS main_branch_latest_features;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE MATERIALIZED VIEW main_branch_latest_features AS
      WITH latest_commits AS (
        SELECT
          c.id,
          c.branch_id,
          c.created_at,
          ROW_NUMBER() OVER (PARTITION BY c.branch_id ORDER BY c.created_at DESC) as rn
        FROM commits c
        INNER JOIN branches b ON c.branch_id = b.id
        WHERE b.is_main = true
      ),
      main_branch_commits AS (
        SELECT id, branch_id, created_at
        FROM latest_commits
        WHERE rn <= 1000
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
            ORDER BY mbc.created_at DESC, sf.created_at DESC
          ) as rn
        FROM spatial_features sf
        INNER JOIN main_branch_commits mbc ON sf.commit_id = mbc.id
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
          commit_id,
          ST_MakeValid(ST_Transform(geom, 3857)) as geom_3857
        FROM features_with_order
        WHERE rn = 1
      )
      SELECT
        feature_id,
        geometry_type,
        properties,
        operation,
        commit_id,
        geom_3857,
        -- Pre-compute simplified geometries for different zoom levels
        ST_SimplifyPreserveTopology(geom_3857, 100) as geom_3857_z0_5,
        ST_SimplifyPreserveTopology(geom_3857, 10) as geom_3857_z6_8,
        ST_SimplifyPreserveTopology(geom_3857, 1) as geom_3857_z9_11,
        -- Pre-compute areas for filtering
        ST_Area(geom_3857) as area_3857,
        ST_Area(ST_SimplifyPreserveTopology(geom_3857, 100)) as area_3857_z0_5,
        ST_Area(ST_SimplifyPreserveTopology(geom_3857, 10)) as area_3857_z6_8,
        ST_Area(ST_SimplifyPreserveTopology(geom_3857, 1)) as area_3857_z9_11
      FROM latest_features;
    `);

    await queryRunner.query(`
      CREATE INDEX idx_main_branch_features_geom
      ON main_branch_latest_features USING GIST(geom_3857);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_main_branch_features_feature_id
      ON main_branch_latest_features(feature_id);
    `);
  }
}

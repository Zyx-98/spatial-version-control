import { MigrationInterface, QueryRunner } from 'typeorm';

export class OptimizeMvtPerformance1765600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP MATERIALIZED VIEW IF EXISTS main_branch_latest_features CASCADE;
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
        -- Pre-validated Web Mercator geometry (no need for ST_IsValid or ST_MakeValid at query time)
        ST_MakeValid(ST_Transform(sf.geom, 3857)) as geom_3857,
        -- Pre-simplified geometries for different zoom level ranges
        -- These eliminate the need for ST_SimplifyPreserveTopology at query time
        ST_SimplifyPreserveTopology(ST_MakeValid(ST_Transform(sf.geom, 3857)), 100) as geom_3857_z0_5,
        ST_SimplifyPreserveTopology(ST_MakeValid(ST_Transform(sf.geom, 3857)), 10) as geom_3857_z6_8,
        ST_SimplifyPreserveTopology(ST_MakeValid(ST_Transform(sf.geom, 3857)), 1) as geom_3857_z9_11,
        -- Calculate geometry bounds for zoom-level optimization
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
        -- Only include valid geometries in the view
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
      CREATE INDEX idx_main_mv_geom_gist
      ON main_branch_latest_features USING GIST (geom)
      WHERE geom IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION refresh_main_branch_view()
      RETURNS TRIGGER AS $$
      DECLARE
        branch_is_main BOOLEAN;
      BEGIN
        -- Check if the commit belongs to a main branch
        SELECT b.is_main INTO branch_is_main
        FROM branches b
        WHERE b.id = NEW.branch_id;

        -- Only refresh if it's a main branch commit
        IF branch_is_main THEN
          REFRESH MATERIALIZED VIEW CONCURRENTLY main_branch_latest_features;
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trigger_refresh_main_branch_view ON commits;
    `);

    await queryRunner.query(`
      CREATE TRIGGER trigger_refresh_main_branch_view
      AFTER INSERT ON commits
      FOR EACH ROW
      EXECUTE FUNCTION refresh_main_branch_view();
    `);

    await queryRunner.query(`ANALYZE main_branch_latest_features;`);
    await queryRunner.query(`ANALYZE spatial_features;`);
    await queryRunner.query(`ANALYZE commits;`);
    await queryRunner.query(`ANALYZE branches;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trigger_refresh_main_branch_view ON commits;
    `);

    await queryRunner.query(`
      DROP FUNCTION IF EXISTS refresh_main_branch_view();
    `);

    await queryRunner.query(`
      DROP MATERIALIZED VIEW IF EXISTS main_branch_latest_features CASCADE;
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
        ST_Transform(sf.geom, 3857) as geom_3857,
        sf.commit_id,
        sf.created_at
      FROM spatial_features sf
      INNER JOIN latest_commits lc ON sf.commit_id = lc.id
      WHERE sf.operation != 'delete'
        AND sf.geom IS NOT NULL
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
      CREATE INDEX idx_main_mv_geom_gist
      ON main_branch_latest_features USING GIST (geom)
      WHERE geom IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION refresh_main_branch_view()
      RETURNS TRIGGER AS $$
      DECLARE
        branch_is_main BOOLEAN;
      BEGIN
        SELECT b.is_main INTO branch_is_main
        FROM branches b
        WHERE b.id = NEW.branch_id;

        IF branch_is_main THEN
          REFRESH MATERIALIZED VIEW CONCURRENTLY main_branch_latest_features;
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      CREATE TRIGGER trigger_refresh_main_branch_view
      AFTER INSERT ON commits
      FOR EACH ROW
      EXECUTE FUNCTION refresh_main_branch_view();
    `);
  }
}

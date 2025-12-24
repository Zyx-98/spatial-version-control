import { MigrationInterface, QueryRunner } from 'typeorm';

export class OptimizeVectorTiles1765500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sf_geom_3857_gist
      ON spatial_features USING GIST (ST_Transform(geom, 3857))
      WHERE geom IS NOT NULL AND operation != 'delete';
    `);

    await queryRunner.query(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS main_branch_latest_features AS
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
      CREATE UNIQUE INDEX IF NOT EXISTS idx_main_mv_feature_id
      ON main_branch_latest_features (feature_id);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_main_mv_geom_3857_gist
      ON main_branch_latest_features USING GIST (geom_3857)
      WHERE geom_3857 IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_main_mv_geom_gist
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

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sf_active_features_geom
      ON spatial_features (commit_id, feature_id)
      INCLUDE (geom, properties, geometry_type)
      WHERE operation != 'delete' AND geom IS NOT NULL;
    `);

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
      DROP MATERIALIZED VIEW IF EXISTS main_branch_latest_features;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_sf_active_features_geom;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_sf_geom_3857_gist;
    `);
  }
}

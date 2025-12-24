import { MigrationInterface, QueryRunner } from 'typeorm';

export class RecreateMainBranchMaterializedView1766400000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE MATERIALIZED VIEW main_branch_latest_features AS
      WITH latest_commits AS (
        SELECT
          b.id as branch_id,
          unnest(c.ancestor_ids) as commit_id,
          c.created_at,
          generate_series(0, array_length(c.ancestor_ids, 1) - 1) as depth
        FROM branches b
        INNER JOIN commits c ON b.head_commit_id = c.id
        WHERE b.is_main = true
          AND b.head_commit_id IS NOT NULL
      ),
      features_with_order AS (
        SELECT
          sf.id,
          sf.feature_id,
          sf.geometry_type,
          sf.geometry,
          sf.geom,
          sf.properties,
          sf.operation,
          sf.commit_id,
          sf.created_at,
          sf.updated_at,
          lc.branch_id,
          ROW_NUMBER() OVER (
            PARTITION BY sf.feature_id
            ORDER BY lc.created_at DESC, sf.created_at DESC
          ) as rn
        FROM latest_commits lc
        INNER JOIN spatial_features sf ON sf.commit_id = lc.commit_id
      )
      SELECT
        id,
        feature_id,
        geometry_type,
        geometry,
        geom,
        ST_MakeValid(ST_Transform(geom, 3857)) as geom_3857,
        properties,
        operation,
        commit_id,
        created_at,
        updated_at,
        branch_id
      FROM features_with_order
      WHERE rn = 1
        AND operation != 'delete';
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_main_mv_feature_id
      ON main_branch_latest_features (feature_id);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_main_mv_geom
      ON main_branch_latest_features USING GIST (geom);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_main_mv_geom_3857
      ON main_branch_latest_features USING GIST (geom_3857);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_main_mv_geometry_type
      ON main_branch_latest_features (geometry_type);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_main_mv_properties
      ON main_branch_latest_features USING GIN (properties);
    `);

    await queryRunner.query(`
      ANALYZE main_branch_latest_features;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION refresh_main_branch_view()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Check if the commit is on main branch
        IF (SELECT is_main FROM branches WHERE id = NEW.branch_id) THEN
          -- Use CONCURRENTLY to avoid locking (requires UNIQUE index)
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

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trigger_refresh_main_branch_view ON commits;
    `);

    await queryRunner.query(`
      DROP FUNCTION IF EXISTS refresh_main_branch_view;
    `);

    await queryRunner.query(`
      DROP MATERIALIZED VIEW IF EXISTS main_branch_latest_features CASCADE;
    `);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBoundsToBranches1766410000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE branches
      ADD COLUMN min_lng DOUBLE PRECISION,
      ADD COLUMN min_lat DOUBLE PRECISION,
      ADD COLUMN max_lng DOUBLE PRECISION,
      ADD COLUMN max_lat DOUBLE PRECISION,
      ADD COLUMN bounds_geom GEOMETRY(POLYGON, 4326);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_branches_bounds_geom
      ON branches USING GIST (bounds_geom);
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION update_branch_bounds()
      RETURNS TRIGGER AS $$
      DECLARE
        branch_bounds RECORD;
      BEGIN
        WITH commit_chain AS (
          SELECT
            unnest(c.ancestor_ids) as id
          FROM branches b
          INNER JOIN commits c ON b.head_commit_id = c.id
          WHERE b.id = NEW.id
            AND b.head_commit_id IS NOT NULL
        ),
        latest_features AS (
          SELECT DISTINCT ON (sf.feature_id)
            sf.geom
          FROM spatial_features sf
          INNER JOIN commit_chain cc ON sf.commit_id = cc.id
          WHERE sf.operation != 'delete'
            AND sf.geom IS NOT NULL
          ORDER BY sf.feature_id, sf.created_at DESC
        )
        SELECT
          ST_XMin(extent) as min_lng,
          ST_YMin(extent) as min_lat,
          ST_XMax(extent) as max_lng,
          ST_YMax(extent) as max_lat,
          ST_Envelope(extent) as bounds_geom
        INTO branch_bounds
        FROM (
          SELECT ST_Extent(geom) as extent
          FROM latest_features
        ) bounds;

        IF branch_bounds.min_lng IS NOT NULL THEN
          UPDATE branches
          SET
            min_lng = branch_bounds.min_lng,
            min_lat = branch_bounds.min_lat,
            max_lng = branch_bounds.max_lng,
            max_lat = branch_bounds.max_lat,
            bounds_geom = branch_bounds.bounds_geom
          WHERE id = NEW.id;
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      CREATE TRIGGER trigger_update_branch_bounds
        AFTER UPDATE OF head_commit_id ON branches
        FOR EACH ROW
        WHEN (NEW.head_commit_id IS DISTINCT FROM OLD.head_commit_id)
        EXECUTE FUNCTION update_branch_bounds();
    `);

    await queryRunner.query(`
      UPDATE branches b
      SET
        min_lng = bounds.min_lng,
        min_lat = bounds.min_lat,
        max_lng = bounds.max_lng,
        max_lat = bounds.max_lat,
        bounds_geom = ST_MakeEnvelope(
          bounds.min_lng,
          bounds.min_lat,
          bounds.max_lng,
          bounds.max_lat,
          4326
        )
      FROM (
        SELECT
          ST_XMin(extent) as min_lng,
          ST_YMin(extent) as min_lat,
          ST_XMax(extent) as max_lng,
          ST_YMax(extent) as max_lat
        FROM (
          SELECT ST_Extent(geom) as extent
          FROM main_branch_latest_features
          WHERE geom IS NOT NULL
        ) bounds
      ) AS bounds
      WHERE b.is_main = true;
    `);

    await queryRunner.query(`
      UPDATE branches b
      SET
        min_lng = bounds.min_lng,
        min_lat = bounds.min_lat,
        max_lng = bounds.max_lng,
        max_lat = bounds.max_lat,
        bounds_geom = ST_MakeEnvelope(
          bounds.min_lng,
          bounds.min_lat,
          bounds.max_lng,
          bounds.max_lat,
          4326
        )
      FROM (
        SELECT
          b2.id,
          ST_XMin(extent) as min_lng,
          ST_YMin(extent) as min_lat,
          ST_XMax(extent) as max_lng,
          ST_YMax(extent) as max_lat
        FROM branches b2
        CROSS JOIN LATERAL (
          WITH commit_chain AS (
            SELECT
              unnest(c.ancestor_ids) as id
            FROM commits c
            WHERE c.id = b2.head_commit_id
          ),
          latest_features AS (
            SELECT DISTINCT ON (sf.feature_id)
              sf.geom
            FROM spatial_features sf
            INNER JOIN commit_chain cc ON sf.commit_id = cc.id
            WHERE sf.operation != 'delete'
              AND sf.geom IS NOT NULL
            ORDER BY sf.feature_id, sf.created_at DESC
          )
          SELECT ST_Extent(geom) as extent
          FROM latest_features
        ) bounds
        WHERE b2.is_main = false
          AND b2.head_commit_id IS NOT NULL
      ) AS bounds
      WHERE b.id = bounds.id;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trigger_update_branch_bounds ON branches;
    `);

    await queryRunner.query(`
      DROP FUNCTION IF EXISTS update_branch_bounds;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_branches_bounds_geom;
    `);

    await queryRunner.query(`
      ALTER TABLE branches
      DROP COLUMN IF EXISTS min_lng,
      DROP COLUMN IF EXISTS min_lat,
      DROP COLUMN IF EXISTS max_lng,
      DROP COLUMN IF EXISTS max_lat,
      DROP COLUMN IF EXISTS bounds_geom;
    `);
  }
}

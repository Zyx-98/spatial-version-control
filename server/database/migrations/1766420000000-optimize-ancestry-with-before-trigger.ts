import { MigrationInterface, QueryRunner } from 'typeorm';

export class OptimizeAncestryWithBeforeTrigger1766420000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS update_commit_ancestors ON commits;
    `);

    await queryRunner.query(`
      DROP FUNCTION IF EXISTS update_commit_ancestor_ids();
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION update_commit_ancestor_ids()
      RETURNS TRIGGER AS $$
      BEGIN
          IF NEW.parent_commit_id IS NOT NULL THEN
              SELECT ancestor_ids || NEW.id INTO NEW.ancestor_ids
              FROM commits
              WHERE id = NEW.parent_commit_id;

              IF NEW.ancestor_ids IS NULL THEN
                  NEW.ancestor_ids := ARRAY[NEW.id];
              END IF;
          ELSE
              NEW.ancestor_ids := ARRAY[NEW.id];
          END IF;

          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      CREATE TRIGGER update_commit_ancestors
      BEFORE INSERT ON commits
      FOR EACH ROW
      EXECUTE FUNCTION update_commit_ancestor_ids();
    `);

    await queryRunner.query(`
      ALTER TABLE commits DISABLE TRIGGER update_commit_ancestors;
    `);

    await queryRunner.query(`
      WITH RECURSIVE commit_ancestry AS (
        SELECT
          id,
          parent_commit_id,
          ARRAY[id] as ancestor_ids,
          created_at
        FROM commits
        WHERE parent_commit_id IS NULL

        UNION ALL

        SELECT
          c.id,
          c.parent_commit_id,
          ca.ancestor_ids || c.id,
          c.created_at
        FROM commits c
        INNER JOIN commit_ancestry ca ON c.parent_commit_id = ca.id
      )
      UPDATE commits c
      SET ancestor_ids = ca.ancestor_ids
      FROM commit_ancestry ca
      WHERE c.id = ca.id;
    `);

    await queryRunner.query(`
      ALTER TABLE commits ENABLE TRIGGER update_commit_ancestors;
    `);

    const ginIndexExists = await queryRunner.query(`
      SELECT 1 FROM pg_indexes
      WHERE tablename = 'commits'
      AND indexname = 'idx_commits_ancestor_ids_gin';
    `);

    if (!ginIndexExists || ginIndexExists.length === 0) {
      await queryRunner.commitTransaction();

      await queryRunner.query(`
        CREATE INDEX CONCURRENTLY idx_commits_ancestor_ids_gin
        ON commits USING GIN (ancestor_ids);
      `);

      await queryRunner.startTransaction();
    }

    const parentIndexExists = await queryRunner.query(`
      SELECT 1 FROM pg_indexes
      WHERE tablename = 'commits'
      AND indexname = 'idx_commits_parent_id';
    `);

    if (!parentIndexExists || parentIndexExists.length === 0) {
      await queryRunner.commitTransaction();

      await queryRunner.query(`
        CREATE INDEX CONCURRENTLY idx_commits_parent_id
        ON commits(parent_commit_id)
        WHERE parent_commit_id IS NOT NULL;
      `);

      await queryRunner.startTransaction();
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS update_commit_ancestors ON commits;
    `);

    await queryRunner.query(`
      DROP FUNCTION IF EXISTS update_commit_ancestor_ids();
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_commits_ancestor_ids_gin;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_commits_parent_id;
    `);
  }
}

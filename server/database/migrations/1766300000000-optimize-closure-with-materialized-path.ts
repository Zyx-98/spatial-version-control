import { MigrationInterface, QueryRunner } from 'typeorm';

export class OptimizeClosureWithMaterializedPath1766300000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE commits
      ADD COLUMN IF NOT EXISTS ancestor_ids UUID[] DEFAULT ARRAY[]::UUID[],
      ADD COLUMN IF NOT EXISTS depth INTEGER DEFAULT 0;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION compute_ancestor_path(commit_uuid UUID)
      RETURNS UUID[] AS $$
      DECLARE
        path UUID[];
        max_depth INTEGER;
      BEGIN
        WITH RECURSIVE ancestors AS (
          SELECT id, parent_commit_id, 0 as depth
          FROM commits
          WHERE id = commit_uuid

          UNION ALL

          SELECT c.id, c.parent_commit_id, a.depth + 1
          FROM ancestors a
          JOIN commits c ON c.id = a.parent_commit_id
          WHERE a.depth < 1000000
        )
        SELECT
          array_agg(id ORDER BY depth DESC),
          MAX(depth)
        INTO path, max_depth
        FROM ancestors;

        IF max_depth >= 999999 THEN
          RAISE WARNING 'Commit % has depth >= 1M, may be incomplete', commit_uuid;
        END IF;

        RETURN path;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      DO $$
      DECLARE
        updated_count INTEGER;
        iteration INTEGER := 0;
        total_commits INTEGER;
      BEGIN
        SELECT COUNT(*) INTO total_commits
        FROM commits
        WHERE ancestor_ids = ARRAY[]::UUID[];

        RAISE NOTICE 'Backfilling % commits...', total_commits;

        LOOP
          iteration := iteration + 1;

          UPDATE commits c
          SET
            ancestor_ids = CASE
              WHEN c.parent_commit_id IS NULL THEN ARRAY[c.id]
              ELSE p.ancestor_ids || c.id
            END,
            depth = CASE
              WHEN c.parent_commit_id IS NULL THEN 0
              ELSE p.depth + 1
            END
          FROM commits p
          WHERE c.ancestor_ids = ARRAY[]::UUID[]
            AND (
              c.parent_commit_id IS NULL
              OR (c.parent_commit_id = p.id AND p.ancestor_ids != ARRAY[]::UUID[])
            );

          GET DIAGNOSTICS updated_count = ROW_COUNT;

          RAISE NOTICE 'Iteration %: Updated % commits', iteration, updated_count;

          EXIT WHEN updated_count = 0;

          IF iteration > 1000000 THEN
            RAISE EXCEPTION 'Backfill exceeded 1M iterations - possible cycle detected';
          END IF;
        END LOOP;

        SELECT COUNT(*) INTO updated_count
        FROM commits
        WHERE ancestor_ids = ARRAY[]::UUID[];

        IF updated_count > 0 THEN
          RAISE WARNING '% commits still missing paths - may have cycles or orphaned commits', updated_count;
        ELSE
          RAISE NOTICE 'Successfully backfilled all % commits!', total_commits;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION maintain_commit_path()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.parent_commit_id IS NULL THEN
          NEW.ancestor_ids := ARRAY[NEW.id];
          NEW.depth := 0;
        ELSE
          SELECT
            parent.ancestor_ids || NEW.id,
            parent.depth + 1
          INTO
            NEW.ancestor_ids,
            NEW.depth
          FROM commits parent
          WHERE parent.id = NEW.parent_commit_id;
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trigger_maintain_commit_path ON commits;

      CREATE TRIGGER trigger_maintain_commit_path
        BEFORE INSERT ON commits
        FOR EACH ROW
        EXECUTE FUNCTION maintain_commit_path();
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_commits_ancestor_ids
      ON commits USING GIN (ancestor_ids);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_commits_depth
      ON commits (depth);
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION is_ancestor(
        ancestor_id UUID,
        descendant_id UUID
      ) RETURNS BOOLEAN AS $$
      BEGIN
        RETURN ancestor_id = ANY(
          SELECT ancestor_ids FROM commits WHERE id = descendant_id
        );
      END;
      $$ LANGUAGE plpgsql IMMUTABLE;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION get_ancestors(commit_id UUID)
      RETURNS TABLE(ancestor_id UUID, depth INTEGER) AS $$
      BEGIN
        RETURN QUERY
        SELECT
          unnest(ancestor_ids) as ancestor_id,
          generate_series(0, array_length(ancestor_ids, 1) - 1) as depth
        FROM commits
        WHERE id = commit_id;
      END;
      $$ LANGUAGE plpgsql IMMUTABLE;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION find_common_ancestor(
        commit_a UUID,
        commit_b UUID
      ) RETURNS UUID AS $$
      DECLARE
        common_ancestor UUID;
      BEGIN
        WITH
        a_ancestors AS (
          SELECT unnest(ancestor_ids) as id,
                 generate_series(1, array_length(ancestor_ids, 1)) as pos
          FROM commits WHERE id = commit_a
        ),
        b_ancestors AS (
          SELECT unnest(ancestor_ids) as id,
                 generate_series(1, array_length(ancestor_ids, 1)) as pos
          FROM commits WHERE id = commit_b
        )
        SELECT a.id INTO common_ancestor
        FROM a_ancestors a
        INNER JOIN b_ancestors b ON a.id = b.id
        ORDER BY a.pos DESC, b.pos DESC
        LIMIT 1;

        RETURN common_ancestor;
      END;
      $$ LANGUAGE plpgsql IMMUTABLE;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP FUNCTION IF EXISTS find_common_ancestor;`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS get_ancestors;`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS is_ancestor;`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS compute_ancestor_path;`);

    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trigger_maintain_commit_path ON commits;`,
    );
    await queryRunner.query(`DROP FUNCTION IF EXISTS maintain_commit_path;`);

    await queryRunner.query(`DROP INDEX IF EXISTS idx_commits_depth;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_commits_ancestor_ids;`);

    await queryRunner.query(`
      ALTER TABLE commits
      DROP COLUMN IF EXISTS depth,
      DROP COLUMN IF EXISTS ancestor_ids;
    `);
  }
}

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
        total_commits INTEGER;
        updated_count INTEGER;
        orphaned_count INTEGER;
      BEGIN
        SELECT COUNT(*) INTO total_commits
        FROM commits
        WHERE ancestor_ids = ARRAY[]::UUID[] OR ancestor_ids IS NULL;

        RAISE NOTICE 'Backfilling % commits using recursive CTE...', total_commits;

        WITH RECURSIVE commit_ancestry AS (
          SELECT
            id,
            parent_commit_id,
            ARRAY[id] as ancestor_ids,
            0 as depth,
            ARRAY[id::text] as path_check
          FROM commits
          WHERE parent_commit_id IS NULL

          UNION ALL

          SELECT
            c.id,
            c.parent_commit_id,
            ca.ancestor_ids || c.id,
            ca.depth + 1,
            ca.path_check || c.id::text
          FROM commits c
          INNER JOIN commit_ancestry ca ON c.parent_commit_id = ca.id
          WHERE NOT (c.id::text = ANY(ca.path_check))
            AND ca.depth < 1000000
        )
        UPDATE commits c
        SET
          ancestor_ids = ca.ancestor_ids,
          depth = ca.depth
        FROM commit_ancestry ca
        WHERE c.id = ca.id;

        GET DIAGNOSTICS updated_count = ROW_COUNT;

        RAISE NOTICE 'Successfully updated % commits', updated_count;

        SELECT COUNT(*) INTO orphaned_count
        FROM commits c
        WHERE (ancestor_ids = ARRAY[]::UUID[] OR ancestor_ids IS NULL)
          AND c.parent_commit_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM commits p WHERE p.id = c.parent_commit_id
          );

        IF orphaned_count > 0 THEN
          RAISE WARNING '% orphaned commits found (parent does not exist)', orphaned_count;

          UPDATE commits
          SET
            ancestor_ids = ARRAY[id],
            depth = 0
          WHERE (ancestor_ids = ARRAY[]::UUID[] OR ancestor_ids IS NULL)
            AND parent_commit_id IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM commits p WHERE p.id = parent_commit_id
            );

          RAISE NOTICE 'Orphaned commits set as root commits';
        END IF;

        SELECT COUNT(*) INTO updated_count
        FROM commits
        WHERE ancestor_ids = ARRAY[]::UUID[] OR ancestor_ids IS NULL;

        IF updated_count > 0 THEN
          RAISE WARNING '% commits still missing paths - likely have circular references', updated_count;
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

import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCommitClosureTable1765900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE commit_closure (
        ancestor_id UUID NOT NULL,
        descendant_id UUID NOT NULL,
        depth INTEGER NOT NULL,
        PRIMARY KEY (ancestor_id, descendant_id),
        FOREIGN KEY (ancestor_id) REFERENCES commits(id) ON DELETE CASCADE,
        FOREIGN KEY (descendant_id) REFERENCES commits(id) ON DELETE CASCADE
      );
    `);

    await queryRunner.query(`
      CREATE INDEX idx_commit_closure_ancestor ON commit_closure(ancestor_id);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_commit_closure_descendant ON commit_closure(descendant_id);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_commit_closure_depth ON commit_closure(depth);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_commit_closure_desc_depth ON commit_closure(descendant_id, depth);
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION insert_commit_closure()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Insert self-reference (depth 0)
        INSERT INTO commit_closure (ancestor_id, descendant_id, depth)
        VALUES (NEW.id, NEW.id, 0);

        -- If this commit has a parent, insert all ancestor relationships
        IF NEW.parent_commit_id IS NOT NULL THEN
          -- Copy all ancestor relationships from parent, incrementing depth
          INSERT INTO commit_closure (ancestor_id, descendant_id, depth)
          SELECT ancestor_id, NEW.id, depth + 1
          FROM commit_closure
          WHERE descendant_id = NEW.parent_commit_id;
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      CREATE TRIGGER trigger_insert_commit_closure
      AFTER INSERT ON commits
      FOR EACH ROW
      EXECUTE FUNCTION insert_commit_closure();
    `);

    await queryRunner.query(`
      INSERT INTO commit_closure (ancestor_id, descendant_id, depth)
      WITH RECURSIVE commit_tree AS (
        -- Start with all commits (self-references at depth 0)
        SELECT id as ancestor_id, id as descendant_id, 0 as depth
        FROM commits

        UNION ALL

        -- Recursively find all ancestors
        SELECT ct.ancestor_id, c.id as descendant_id, ct.depth + 1
        FROM commits c
        INNER JOIN commit_tree ct ON c.parent_commit_id = ct.descendant_id
        -- No depth limit here - we want the complete closure
      )
      SELECT DISTINCT ancestor_id, descendant_id, depth
      FROM commit_tree
      ON CONFLICT (ancestor_id, descendant_id) DO NOTHING;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION get_branch_commit_chain(p_branch_id UUID)
      RETURNS TABLE (
        commit_id UUID,
        depth INTEGER,
        created_at TIMESTAMP WITH TIME ZONE
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT DISTINCT
          cc.ancestor_id as commit_id,
          cc.depth,
          c.created_at
        FROM branches b
        INNER JOIN commit_closure cc ON b.head_commit_id = cc.descendant_id
        INNER JOIN commits c ON cc.ancestor_id = c.id
        WHERE b.id = p_branch_id
          AND b.head_commit_id IS NOT NULL
        ORDER BY cc.depth ASC, c.created_at ASC;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`ANALYZE commit_closure;`);
    await queryRunner.query(`ANALYZE commits;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS get_branch_commit_chain(UUID);`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trigger_insert_commit_closure ON commits;`,
    );
    await queryRunner.query(`DROP FUNCTION IF EXISTS insert_commit_closure();`);
    await queryRunner.query(`DROP TABLE IF EXISTS commit_closure;`);
  }
}

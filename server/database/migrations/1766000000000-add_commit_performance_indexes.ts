import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCommitPerformanceIndexes1766000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_commits_branch_created_parent
      ON commits (branch_id, created_at DESC, parent_commit_id)
      WHERE parent_commit_id IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_commits_parent_created
      ON commits (parent_commit_id, created_at DESC)
      WHERE parent_commit_id IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_spatial_features_commit_feature
      ON spatial_features (commit_id, feature_id)
      INCLUDE (geom, properties, geometry_type, operation)
      WHERE operation != 'delete';
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_spatial_features_operation
      ON spatial_features (operation, feature_id)
      WHERE operation != 'delete';
    `);

    await queryRunner.query(`
      ALTER TABLE commits SET (autovacuum_analyze_scale_factor = 0.05);
    `);

    await queryRunner.query(`
      ALTER TABLE spatial_features SET (autovacuum_analyze_scale_factor = 0.05);
    `);

    await queryRunner.query(`
      ALTER TABLE commit_closure SET (autovacuum_analyze_scale_factor = 0.05);
    `);

    await queryRunner.query(`ANALYZE commits;`);
    await queryRunner.query(`ANALYZE spatial_features;`);
    await queryRunner.query(`ANALYZE commit_closure;`);
    await queryRunner.query(`ANALYZE branches;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_commits_branch_created_parent;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_commits_parent_created;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_spatial_features_commit_feature;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_spatial_features_operation;
    `);

    await queryRunner.query(`
      ALTER TABLE commits RESET (autovacuum_analyze_scale_factor);
    `);

    await queryRunner.query(`
      ALTER TABLE spatial_features RESET (autovacuum_analyze_scale_factor);
    `);

    await queryRunner.query(`
      ALTER TABLE commit_closure RESET (autovacuum_analyze_scale_factor);
    `);
  }
}

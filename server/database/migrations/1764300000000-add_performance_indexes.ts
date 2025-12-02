import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPerformanceIndexes1764300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_commits_branch_created
      ON commits (branch_id, created_at);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_commits_parent
      ON commits (parent_commit_id);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_commits_branch
      ON commits (branch_id);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_spatial_features_feature_commit
      ON spatial_features (feature_id, commit_id);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_spatial_features_commit
      ON spatial_features (commit_id);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_spatial_features_feature
      ON spatial_features (feature_id);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_spatial_features_geom
      ON spatial_features USING GIST (geom);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_spatial_features_geom;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_spatial_features_feature;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_spatial_features_commit;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_spatial_features_feature_commit;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_commits_branch;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_commits_parent;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_commits_branch_created;
    `);
  }
}

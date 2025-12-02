import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMvtAndSpatialIndexes1764400000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sf_commit_feature_created
      ON spatial_features (commit_id, feature_id, created_at DESC);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_commits_branch_parent
      ON commits (branch_id, parent_commit_id)
      INCLUDE (created_at);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sf_geom_commit_operation
      ON spatial_features USING GIST (geom)
      INCLUDE (commit_id, feature_id, operation);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sf_feature_created
      ON spatial_features (feature_id, created_at DESC)
      INCLUDE (commit_id, operation);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_commits_sf_composite
      ON spatial_features (commit_id, operation, feature_id);
    `);

    await queryRunner.query(`ANALYZE spatial_features;`);
    await queryRunner.query(`ANALYZE commits;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_commits_sf_composite;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_sf_feature_created;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_sf_geom_commit_operation;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_commits_branch_parent;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_sf_commit_feature_created;
    `);
  }
}

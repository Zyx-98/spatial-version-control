import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSpatialFeaturesIndexes1765700000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_spatial_features_geom_gist
      ON spatial_features USING GIST (geom)
      WHERE geom IS NOT NULL AND operation != 'delete';
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_spatial_features_commit_operation
      ON spatial_features (commit_id, operation)
      INCLUDE (feature_id, geom, properties, geometry_type)
      WHERE operation != 'delete' AND geom IS NOT NULL;
    `);

    await queryRunner.query(`ANALYZE spatial_features;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_spatial_features_commit_operation;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_spatial_features_geom_gist;
    `);
  }
}

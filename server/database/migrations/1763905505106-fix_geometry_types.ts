import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixGeometryTypes1763905505106 implements MigrationInterface {
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."spatial_features_geometry_type_enum"
      ADD VALUE IF NOT EXISTS 'LineString'
    `);

    await queryRunner.query(`
      ALTER TYPE "public"."spatial_features_geometry_type_enum"
      ADD VALUE IF NOT EXISTS 'MultiLineString'
    `);

    await queryRunner.query(`
      UPDATE spatial_features
      SET geometry_type = 'LineString'
      WHERE geometry_type = 'Line'
    `);

    await queryRunner.query(`
      UPDATE spatial_features
      SET geometry_type = 'MultiLineString'
      WHERE geometry_type = 'MultiLine'
    `);

    await queryRunner.query(`
      UPDATE spatial_features
      SET geometry = jsonb_set(geometry, '{type}', '"LineString"')
      WHERE geometry->>'type' = 'Line'
    `);

    await queryRunner.query(`
      UPDATE spatial_features
      SET geometry = jsonb_set(geometry, '{type}', '"MultiLineString"')
      WHERE geometry->>'type' = 'MultiLine'
    `);

    await queryRunner.query(`
      ALTER TABLE spatial_features
      ALTER COLUMN geometry_type TYPE text
    `);

    await queryRunner.query(`
      DROP TYPE "public"."spatial_features_geometry_type_enum"
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."spatial_features_geometry_type_enum" AS ENUM(
        'Point',
        'LineString',
        'Polygon',
        'MultiPoint',
        'MultiLineString',
        'MultiPolygon'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE spatial_features
      ALTER COLUMN geometry_type TYPE "public"."spatial_features_geometry_type_enum"
      USING geometry_type::"public"."spatial_features_geometry_type_enum"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE spatial_features
      SET geometry = jsonb_set(geometry, '{type}', '"Line"')
      WHERE geometry->>'type' = 'LineString'
    `);

    await queryRunner.query(`
      UPDATE spatial_features
      SET geometry = jsonb_set(geometry, '{type}', '"MultiLine"')
      WHERE geometry->>'type' = 'MultiLineString'
    `);

    await queryRunner.query(`
      ALTER TABLE spatial_features
      ALTER COLUMN geometry_type TYPE text
    `);

    await queryRunner.query(`
      UPDATE spatial_features
      SET geometry_type = 'Line'
      WHERE geometry_type = 'LineString'
    `);

    await queryRunner.query(`
      UPDATE spatial_features
      SET geometry_type = 'MultiLine'
      WHERE geometry_type = 'MultiLineString'
    `);

    await queryRunner.query(`
      DROP TYPE "public"."spatial_features_geometry_type_enum"
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."spatial_features_geometry_type_enum" AS ENUM(
        'Point',
        'Line',
        'Polygon',
        'MultiPoint',
        'MultiLine',
        'MultiPolygon'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE spatial_features
      ALTER COLUMN geometry_type TYPE "public"."spatial_features_geometry_type_enum"
      USING geometry_type::"public"."spatial_features_geometry_type_enum"
    `);
  }
}

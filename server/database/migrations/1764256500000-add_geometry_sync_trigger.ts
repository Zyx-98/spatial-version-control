import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGeometrySyncTrigger1764256500000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION sync_geometry_to_geom()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.geometry IS NOT NULL THEN
          -- Convert GeoJSON to PostGIS geometry with SRID 4326
          NEW.geom := ST_GeomFromGeoJSON(NEW.geometry::text);
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      CREATE TRIGGER spatial_features_geom_insert
        BEFORE INSERT ON spatial_features
        FOR EACH ROW
        EXECUTE FUNCTION sync_geometry_to_geom();
    `);

    await queryRunner.query(`
      CREATE TRIGGER spatial_features_geom_update
        BEFORE UPDATE ON spatial_features
        FOR EACH ROW
        WHEN (NEW.geometry IS DISTINCT FROM OLD.geometry)
        EXECUTE FUNCTION sync_geometry_to_geom();
    `);

    await queryRunner.query(`
      UPDATE spatial_features
      SET geom = ST_GeomFromGeoJSON(geometry::text)
      WHERE geometry IS NOT NULL AND geom IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS spatial_features_geom_update ON spatial_features;
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS spatial_features_geom_insert ON spatial_features;
    `);

    await queryRunner.query(`
      DROP FUNCTION IF EXISTS sync_geometry_to_geom();
    `);
  }
}

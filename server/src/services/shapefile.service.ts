import { Injectable, BadRequestException } from '@nestjs/common';
import * as gdal from 'gdal-async';
import * as archiver from 'archiver';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as AdmZip from 'adm-zip';
import {
  SpatialFeatureType,
  FeatureOperation,
} from '../entities/spatial-feature.entity';

@Injectable()
export class ShapefileService {
  async parseShapefile(zipBuffer: Buffer): Promise<any[]> {
    const tempDir = this.extractZipToTemp(zipBuffer);

    try {
      const shpFile = this.findShapefileInDir(tempDir);

      if (!shpFile) {
        throw new BadRequestException('No .shp file found in the uploaded zip');
      }

      const dataset = await gdal.openAsync(shpFile);
      const layer = dataset.layers.get(0);

      if (!layer) {
        throw new BadRequestException('No layers found in shapefile');
      }

      const features: any[] = [];

      for (const feature of layer.features) {
        const geometry = feature.getGeometry();

        if (!geometry) {
          continue;
        }

        const geojsonGeometry = JSON.parse(geometry.toJSON());

        const properties: Record<string, any> = {};
        const fields = layer.fields.getNames();
        fields.forEach((fieldName: string) => {
          properties[fieldName] = feature.fields.get(fieldName);
        });

        const featureId = this.extractFeatureId(feature, properties);

        features.push({
          featureId,
          geometryType: this.mapGdalGeometryType(geometry.wkbType),
          geometry: geojsonGeometry,
          properties,
          operation: FeatureOperation.CREATE,
        });
      }

      return features;
    } finally {
      this.cleanupTempDir(tempDir);
    }
  }

  async exportToShapefile(
    features: any[],
    filename = 'export',
  ): Promise<Buffer> {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shapefile-export-'));

    try {
      const nonDeletedFeatures = features.filter(
        (f) => f.operation !== FeatureOperation.DELETE,
      );

      if (nonDeletedFeatures.length === 0) {
        throw new BadRequestException('No features to export');
      }

      const featuresByType = new Map<string, any[]>();
      nonDeletedFeatures.forEach((feature) => {
        const type = feature.geometryType;
        if (!featuresByType.has(type)) {
          featuresByType.set(type, []);
        }
        const typeFeatures = featuresByType.get(type);
        if (typeFeatures) {
          typeFeatures.push(feature);
        }
      });

      const geometryTypeNames: Record<string, string> = {
        Point: 'points',
        LineString: 'lines',
        Polygon: 'polygons',
        MultiPoint: 'multipoints',
        MultiLineString: 'multilines',
        MultiPolygon: 'multipolygons',
      };

      for (const [geometryType, typeFeatures] of featuresByType.entries()) {
        const typeName =
          geometryTypeNames[geometryType] || geometryType.toLowerCase();
        const typeFilename = `${filename}_${typeName}`;
        this.createSingleShapefile(
          tempDir,
          typeFilename,
          typeFeatures,
          geometryType,
        );
      }

      return await this.zipAllShapefiles(tempDir);
    } finally {
      this.cleanupTempDir(tempDir);
    }
  }

  private createSingleShapefile(
    tempDir: string,
    filename: string,
    features: any[],
    geometryType: string,
  ): void {
    const shpPath = path.join(tempDir, `${filename}.shp`);
    const driver = gdal.drivers.get('ESRI Shapefile');
    const dataset = driver.create(shpPath);

    const wkbType = this.mapToGdalGeometryType(
      geometryType as SpatialFeatureType,
    );

    const srs = gdal.SpatialReference.fromEPSG(4326);
    const layer = dataset.layers.create(filename, srs, wkbType);

    const allPropertyKeys = new Set<string>();
    features.forEach((f) => {
      if (f.properties) {
        Object.keys(f.properties).forEach((key) => allPropertyKeys.add(key));
      }
    });

    allPropertyKeys.forEach((key) => {
      const sampleValue = features.find((f) => f.properties?.[key])?.[
        'properties'
      ]?.[key];
      const fieldType = this.inferFieldType(sampleValue);
      const fieldDefn = new gdal.FieldDefn(key, fieldType);
      layer.fields.add(fieldDefn);
    });

    features.forEach((f) => {
      const feature = new gdal.Feature(layer);

      const gdalGeometry = gdal.Geometry.fromGeoJson(f.geometry);
      feature.setGeometry(gdalGeometry);

      if (f.properties) {
        Object.keys(f.properties).forEach((key) => {
          if (layer.fields.indexOf(key) !== -1) {
            feature.fields.set(key, f.properties[key]);
          }
        });
      }

      layer.features.add(feature);
    });

    dataset.close();
  }

  private extractZipToTemp(zipBuffer: Buffer): string {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shapefile-'));
    const zip = new AdmZip(zipBuffer);
    zip.extractAllTo(tempDir, true);
    return tempDir;
  }

  private findShapefileInDir(dir: string): string | null {
    const files = fs.readdirSync(dir, { recursive: true });

    for (const file of files) {
      const filePath = path.join(dir, file as string);
      if (
        fs.statSync(filePath).isFile() &&
        path.extname(filePath).toLowerCase() === '.shp'
      ) {
        return filePath;
      }
    }

    return null;
  }

  private async zipShapefileComponents(
    dir: string,
    basename: string,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const archive = archiver('zip', { zlib: { level: 9 } });

      archive.on('data', (chunk) => chunks.push(chunk));
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);

      const extensions = ['.shp', '.shx', '.dbf', '.prj', '.cpg'];
      extensions.forEach((ext) => {
        const filePath = path.join(dir, `${basename}${ext}`);
        if (fs.existsSync(filePath)) {
          archive.file(filePath, { name: `${basename}${ext}` });
        }
      });

      archive.finalize();
    });
  }

  private async zipAllShapefiles(dir: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const archive = archiver('zip', { zlib: { level: 9 } });

      archive.on('data', (chunk) => chunks.push(chunk));
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);

      const files = fs.readdirSync(dir);
      files.forEach((file) => {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isFile()) {
          archive.file(filePath, { name: file });
        }
      });

      archive.finalize();
    });
  }

  private cleanupTempDir(dir: string): void {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (error) {
      console.error('Failed to cleanup temp directory:', error);
    }
  }

  private extractFeatureId(
    feature: gdal.Feature,
    properties: Record<string, any>,
  ): string {
    const fid = feature.fid;
    if (fid !== undefined && fid !== null) {
      return String(fid);
    }

    const idFields = ['id', 'fid', 'objectid', 'gid'];
    for (const field of idFields) {
      if (properties[field] !== undefined && properties[field] !== null) {
        return String(properties[field]);
      }
    }

    return crypto.randomUUID();
  }

  private mapGdalGeometryType(wkbType: number): SpatialFeatureType {
    const wkbPoint = 1;
    const wkbLineString = 2;
    const wkbPolygon = 3;
    const wkbMultiPoint = 4;
    const wkbMultiLineString = 5;
    const wkbMultiPolygon = 6;

    const baseType = wkbType & 0xff;

    const mapping: Record<number, SpatialFeatureType> = {
      [wkbPoint]: SpatialFeatureType.POINT,
      [wkbLineString]: SpatialFeatureType.LINE,
      [wkbPolygon]: SpatialFeatureType.POLYGON,
      [wkbMultiPoint]: SpatialFeatureType.MULTI_POINT,
      [wkbMultiLineString]: SpatialFeatureType.MULTI_LINE,
      [wkbMultiPolygon]: SpatialFeatureType.MULTI_POLYGON,
    };

    const mappedType = mapping[baseType];
    if (!mappedType) {
      throw new BadRequestException(
        `Unsupported geometry type: ${wkbType}. Supported types: Point, LineString, Polygon, MultiPoint, MultiLineString, MultiPolygon`,
      );
    }

    return mappedType;
  }

  private mapToGdalGeometryType(type: SpatialFeatureType): number {
    const mapping: Record<SpatialFeatureType, number> = {
      [SpatialFeatureType.POINT]: gdal.wkbPoint,
      [SpatialFeatureType.LINE]: gdal.wkbLineString,
      [SpatialFeatureType.POLYGON]: gdal.wkbPolygon,
      [SpatialFeatureType.MULTI_POINT]: gdal.wkbMultiPoint,
      [SpatialFeatureType.MULTI_LINE]: gdal.wkbMultiLineString,
      [SpatialFeatureType.MULTI_POLYGON]: gdal.wkbMultiPolygon,
    };

    const wkbType = mapping[type];
    if (wkbType === undefined) {
      throw new BadRequestException(
        `Unsupported geometry type: ${type}. Supported types: ${Object.keys(mapping).join(', ')}`,
      );
    }

    return wkbType;
  }

  private inferFieldType(value: any): any {
    if (typeof value === 'number') {
      return Number.isInteger(value) ? gdal.OFTInteger : gdal.OFTReal;
    }
    if (typeof value === 'boolean') {
      return gdal.OFTInteger;
    }
    if (value instanceof Date) {
      return gdal.OFTDateTime;
    }
    return gdal.OFTString;
  }
}

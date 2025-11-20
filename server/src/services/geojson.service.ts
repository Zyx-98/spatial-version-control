import { Injectable, BadRequestException } from '@nestjs/common';
import {
  SpatialFeatureType,
  FeatureOperation,
} from '../entities/spatial-feature.entity';
import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  Geometry,
} from 'geojson';

@Injectable()
export class GeoJsonService {
  parseGeoJson(geojsonContent: Feature | FeatureCollection): any[] {
    if (!geojsonContent || !geojsonContent.type) {
      throw new BadRequestException('Invalid GeoJSON format');
    }

    const features: Feature[] =
      geojsonContent.type === 'FeatureCollection'
        ? geojsonContent.features
        : [geojsonContent];

    if (!features || features.length === 0) {
      throw new BadRequestException('No features found in GeoJSON');
    }

    return features.map((feature, index) => {
      if (!feature.geometry) {
        throw new BadRequestException(
          `Feature at index ${index} is missing geometry`,
        );
      }

      return {
        featureId: this.extractFeatureId(feature),
        geometryType: this.mapGeometryType(feature.geometry.type),
        geometry: feature.geometry,
        properties: feature.properties || {},
        operation: FeatureOperation.CREATE,
      };
    });
  }

  exportToGeoJson(features: any[]): FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: features
        .filter((f) => f.operation !== FeatureOperation.DELETE)
        .map((f) => ({
          type: 'Feature' as const,
          id: f.featureId,
          geometry: f.geometry as Geometry,
          properties: f.properties as GeoJsonProperties,
        })),
    };
  }

  private extractFeatureId(feature: Feature): string {
    if (feature.id !== undefined) {
      return String(feature.id);
    }

    if (feature.properties) {
      if (feature.properties.id) {
        return String(feature.properties.id);
      }
      if (feature.properties.fid) {
        return String(feature.properties.fid);
      }
    }

    return crypto.randomUUID();
  }

  private mapGeometryType(geojsonType: string): SpatialFeatureType {
    const mapping: Record<string, SpatialFeatureType> = {
      Point: SpatialFeatureType.POINT,
      LineString: SpatialFeatureType.LINE,
      Polygon: SpatialFeatureType.POLYGON,
      MultiPoint: SpatialFeatureType.MULTI_POINT,
      MultiLineString: SpatialFeatureType.MULTI_LINE,
      MultiPolygon: SpatialFeatureType.MULTI_POLYGON,
    };

    const mappedType = mapping[geojsonType];
    if (!mappedType) {
      throw new BadRequestException(
        `Unsupported geometry type: ${geojsonType}. Supported types: ${Object.keys(mapping).join(', ')}`,
      );
    }

    return mappedType;
  }

  validateGeoJson(data: any): void {
    if (typeof data !== 'object' || data === null) {
      throw new BadRequestException('GeoJSON must be a valid JSON object');
    }

    if (!data.type) {
      throw new BadRequestException('GeoJSON must have a "type" property');
    }

    if (data.type !== 'Feature' && data.type !== 'FeatureCollection') {
      throw new BadRequestException(
        'GeoJSON type must be "Feature" or "FeatureCollection"',
      );
    }

    if (data.type === 'FeatureCollection' && !Array.isArray(data.features)) {
      throw new BadRequestException(
        'FeatureCollection must have a "features" array',
      );
    }
  }
}

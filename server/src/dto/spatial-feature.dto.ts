import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { FeatureOperation, SpatialFeatureType } from '../entities';

export class SpatialFeatureDto {
  @IsString()
  @IsOptional()
  featureId?: string;

  @IsEnum(SpatialFeatureType)
  @IsNotEmpty()
  geometryType: SpatialFeatureType;

  @IsObject()
  @IsNotEmpty()
  geometry: any;

  @IsObject()
  @IsOptional()
  properties?: any;

  @IsEnum(FeatureOperation)
  @IsNotEmpty()
  operation: FeatureOperation;
}

export class GeoJSONFeatureDto {
  type: 'Feature';
  geometry: {
    type: string;
    coordinates: any;
  };
  properties: any;
}

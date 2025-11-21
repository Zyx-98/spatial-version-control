import {
  IsNotEmpty,
  IsString,
  IsUUID,
  IsArray,
  ValidateNested,
  IsIn,
  IsOptional,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBranchDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsUUID()
  @IsNotEmpty()
  datasetId: string;
}

export class FetchMainBranchDto {
  @IsUUID()
  @IsNotEmpty()
  branchId: string;
}

export class BranchConflictsDto {
  hasConflicts: boolean;
  conflicts: ConflictDetail[];
}

export class ConflictDetail {
  featureId: string;
  mainVersion: any;
  branchVersion: any;
  ancestorVersion: any | null;
  conflictType: 'modified' | 'deleted' | 'both_modified';
}

export class ConflictResolutionDto {
  @IsString()
  @IsNotEmpty()
  featureId: string;

  @IsIn(['use_main', 'use_branch', 'use_ancestor', 'delete', 'custom'])
  @IsNotEmpty()
  resolution: 'use_main' | 'use_branch' | 'use_ancestor' | 'delete' | 'custom';

  @IsOptional()
  @IsObject()
  customGeometry?: any;

  @IsOptional()
  @IsObject()
  customProperties?: any;
}

export class ResolveBranchConflictsDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConflictResolutionDto)
  resolutions: ConflictResolutionDto[];
}

import {
  IsNotEmpty,
  IsString,
  IsUUID,
  IsArray,
  ValidateNested,
  IsIn,
  IsOptional,
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
  conflictType: 'modified' | 'deleted' | 'both_modified';
}

export class ConflictResolutionDto {
  @IsString()
  @IsNotEmpty()
  featureId: string;

  @IsIn(['use_main', 'use_branch'])
  @IsNotEmpty()
  resolution: 'use_main' | 'use_branch';
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

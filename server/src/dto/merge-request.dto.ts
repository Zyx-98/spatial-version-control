import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsIn,
  IsObject,
} from 'class-validator';
import { MergeRequestStatus } from '../entities';

export class CreateMergeRequestDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsUUID()
  @IsNotEmpty()
  sourceBranchId: string;

  @IsUUID()
  @IsNotEmpty()
  targetBranchId: string;
}

export class ReviewMergeRequestDto {
  @IsEnum(MergeRequestStatus)
  @IsNotEmpty()
  status: MergeRequestStatus.APPROVED | MergeRequestStatus.REJECTED;

  @IsString()
  @IsOptional()
  reviewComment?: string;
}

export class ResolveMergeConflictsDto {
  @IsUUID()
  @IsNotEmpty()
  mergeRequestId: string;

  @IsNotEmpty()
  resolutions: ConflictResolution[];

  @IsOptional()
  @IsUUID()
  expectedSourceHeadCommitId?: string;

  @IsOptional()
  @IsUUID()
  expectedTargetHeadCommitId?: string;
}

export class ConflictResolution {
  @IsString()
  @IsNotEmpty()
  featureId: string;

  @IsIn(['use_main', 'use_branch', 'use_ancestor', 'delete', 'custom'])
  @IsNotEmpty()
  resolution: 'use_main' | 'use_branch' | 'use_ancestor' | 'delete' | 'custom';

  @IsOptional()
  @IsObject()
  customData?: {
    geometry?: any;
    properties?: any;
  };
}

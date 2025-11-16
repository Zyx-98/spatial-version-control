import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
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
}

export class ConflictResolution {
  featureId: string;
  resolution: 'use_main' | 'use_branch' | 'custom';
  customData?: any;
}

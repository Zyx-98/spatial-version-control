import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

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

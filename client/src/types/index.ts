// User and Authentication Types
export enum UserRole {
  ADMIN = "admin",
  NORMAL_USER = "normal_user",
}

export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  departmentId: string;
  createdAt: string;
  updatedAt: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  role: UserRole;
  departmentId: string;
}

export interface LoginResponse {
  accessToken: string;
  user: User;
}

// Department Types
export interface Department {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

// Dataset Types
export interface Dataset {
  id: string;
  name: string;
  description?: string;
  departmentId: string;
  branches?: Branch[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateDatasetRequest {
  name: string;
  description?: string;
}

// Branch Types
export interface Branch {
  id: string;
  name: string;
  isMain: boolean;
  isDisabled: boolean;
  hasUnresolvedConflicts: boolean;
  datasetId: string;
  createdById: string;
  headCommitId?: string;
  createdBy?: User;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBranchRequest {
  name: string;
  datasetId: string;
}

export interface BranchConflicts {
  hasConflicts: boolean;
  conflicts: ConflictDetail[];
}

export interface ConflictDetail {
  featureId: string;
  mainVersion: any;
  branchVersion: any;
  ancestorVersion: any | null;
  conflictType: "modified" | "deleted" | "both_modified";
}

export type ConflictResolutionStrategy =
  | "use_main"
  | "use_branch"
  | "use_ancestor"
  | "delete"
  | "custom";

export interface ConflictResolution {
  featureId: string;
  resolution: ConflictResolutionStrategy;
  customGeometry?: any;
  customProperties?: any;
}

export interface BranchWithPermissions {
  branch: Branch;
  canEdit: boolean;
  hasOpenMergeRequest: boolean;
  hasUnresolvedConflicts: boolean;
}

// Spatial Feature Types
export enum SpatialFeatureType {
  POINT = "Point",
  LINE = "LineString",
  POLYGON = "Polygon",
  MULTI_POINT = "MultiPoint",
  MULTI_LINE = "MultiLineString",
  MULTI_POLYGON = "MultiPolygon",
}

export enum FeatureOperation {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
}

export interface Geometry {
  type: string;
  coordinates: any;
}

export interface SpatialFeature {
  id: string;
  featureId: string;
  geometryType: SpatialFeatureType;
  geometry: Geometry;
  properties?: Record<string, any>;
  operation: FeatureOperation;
  commitId: string;
  createdAt: string;
}

export interface SpatialFeatureRequest {
  featureId?: string;
  geometryType: SpatialFeatureType;
  geometry: Geometry;
  properties?: Record<string, any>;
  operation: FeatureOperation;
}

// Commit Types
export interface Commit {
  id: string;
  message: string;
  branchId: string;
  authorId: string;
  parentCommitId?: string;
  author?: User;
  features?: SpatialFeature[];
  createdAt: string;
}

export interface CreateCommitRequest {
  message: string;
  branchId: string;
  features: SpatialFeatureRequest[];
}

export interface CommitChanges {
  commit: {
    id: string;
    message: string;
    author?: User;
    createdAt: string;
  };
  changes: {
    created: SpatialFeature[];
    updated: Array<{
      before: SpatialFeature | null;
      after: SpatialFeature;
    }>;
    deleted: SpatialFeature[];
    total: number;
  };
}

export interface BranchComparison {
  sourceBranchId: string;
  targetBranchId: string;
  summary: {
    added: number;
    modified: number;
    deleted: number;
    unchanged: number;
  };
  changes: {
    added: SpatialFeature[];
    modified: { source: SpatialFeature; target: SpatialFeature }[];
    deleted: SpatialFeature[];
    unchanged: SpatialFeature[];
  };
}

// Merge Request Types
export enum MergeRequestStatus {
  OPEN = "open",
  APPROVED = "approved",
  REJECTED = "rejected",
  MERGED = "merged",
  CLOSED = "closed",
}

export interface MergeRequest {
  id: string;
  title: string;
  description?: string;
  sourceBranchId: string;
  targetBranchId: string;
  createdById: string;
  reviewedById?: string;
  status: MergeRequestStatus;
  conflicts?: any;
  hasConflicts: boolean;
  reviewComment?: string;
  mergedAt?: string;
  sourceBranch?: Branch;
  targetBranch?: Branch;
  createdBy?: User;
  reviewedBy?: User;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMergeRequestRequest {
  title: string;
  description?: string;
  sourceBranchId: string;
  targetBranchId: string;
}

export interface ReviewMergeRequestRequest {
  status: MergeRequestStatus.APPROVED | MergeRequestStatus.REJECTED;
  reviewComment?: string;
}

export interface MergeConflictResolution {
  featureId: string;
  resolution: ConflictResolutionStrategy;
  customData?: any;
}

export interface ResolveMergeConflictsRequest {
  mergeRequestId: string;
  resolutions: MergeConflictResolution[];
}

// GeoJSON Types
export interface GeoJSONFeature {
  type: "Feature";
  geometry: Geometry;
  properties: Record<string, any>;
  id?: string;
}

export interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

// Diff API Types
export interface DiffSummary {
  added: number;
  modified: number;
  deleted: number;
  totalChanges: number;
  affectedArea: {
    minLng: number;
    minLat: number;
    maxLng: number;
    maxLat: number;
  } | null;
}


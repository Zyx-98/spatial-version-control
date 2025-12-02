import axios, { AxiosInstance, AxiosError } from "axios";
import type {
  LoginRequest,
  RegisterRequest,
  LoginResponse,
  Dataset,
  CreateDatasetRequest,
  Branch,
  CreateBranchRequest,
  BranchConflicts,
  BranchWithPermissions,
  Commit,
  CreateCommitRequest,
  CommitChanges,
  BranchComparison,
  MergeRequest,
  CreateMergeRequestRequest,
  ReviewMergeRequestRequest,
  ResolveMergeConflictsRequest,
  SpatialFeature,
  ConflictResolution,
  DiffSummary,
  PaginatedResponse,
} from "@/types";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api";

class ApiService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        "Content-Type": "application/json",
      },
    });

    this.api.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem("token");
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.api.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          window.location.href = "/login";
        }
        return Promise.reject(error);
      }
    );
  }

  async login(data: LoginRequest): Promise<LoginResponse> {
    const response = await this.api.post<LoginResponse>("/auth/login", data);
    return response.data;
  }

  async register(data: RegisterRequest): Promise<any> {
    const response = await this.api.post("/auth/register", data);
    return response.data;
  }

  async getDatasets(): Promise<Dataset[]> {
    const response = await this.api.get<Dataset[]>("/datasets");
    return response.data;
  }

  async getDataset(id: string): Promise<Dataset> {
    const response = await this.api.get<Dataset>(`/datasets/${id}`);
    return response.data;
  }

  async createDataset(data: CreateDatasetRequest): Promise<Dataset> {
    const response = await this.api.post<Dataset>("/datasets", data);
    return response.data;
  }

  async updateDataset(
    id: string,
    data: Partial<CreateDatasetRequest>
  ): Promise<Dataset> {
    const response = await this.api.patch<Dataset>(`/datasets/${id}`, data);
    return response.data;
  }

  async deleteDataset(id: string): Promise<void> {
    await this.api.delete(`/datasets/${id}`);
  }

  async getBranches(datasetId: string): Promise<Branch[]> {
    const response = await this.api.get<Branch[]>("/branches", {
      params: { datasetId },
    });
    return response.data;
  }

  async getBranch(id: string): Promise<Branch> {
    const response = await this.api.get<Branch>(`/branches/${id}`);
    return response.data;
  }

  async getBranchWithPermissions(id: string): Promise<BranchWithPermissions> {
    const response = await this.api.get<BranchWithPermissions>(
      `/branches/${id}/permissions`
    );
    return response.data;
  }

  async createBranch(data: CreateBranchRequest): Promise<Branch> {
    const response = await this.api.post<Branch>("/branches", data);
    return response.data;
  }

  async fetchMainBranch(branchId: string): Promise<BranchConflicts> {
    const response = await this.api.post<BranchConflicts>(
      `/branches/${branchId}/fetch`
    );
    return response.data;
  }

  async resolveBranchConflicts(
    branchId: string,
    resolutions: ConflictResolution[]
  ): Promise<{ success: boolean; message: string }> {
    const response = await this.api.post<{ success: boolean; message: string }>(
      `/branches/${branchId}/resolve-conflicts`,
      { resolutions }
    );
    return response.data;
  }

  async getLatestFeatures(
    branchId: string,
    page?: number,
    limit?: number,
    bbox?: string
  ): Promise<SpatialFeature[] | PaginatedResponse<SpatialFeature>> {
    const params: any = {};
    if (page !== undefined) params.page = page;
    if (limit !== undefined) params.limit = limit;
    if (bbox) params.bbox = bbox;

    const response = await this.api.get(
      `/branches/${branchId}/features`,
      { params }
    );
    return response.data;
    // Returns SpatialFeature[] if no pagination params
    // Returns PaginatedResponse<SpatialFeature> if page/limit provided
  }

  async getBranchDiffSummary(
    sourceBranchId: string,
    targetBranchId: string,
    bbox?: string
  ): Promise<DiffSummary> {
    const response = await this.api.get<DiffSummary>(
      `/branches/${sourceBranchId}/diff/${targetBranchId}/summary`,
      { params: { bbox } }
    );
    return response.data;
  }

  async getCommits(
    branchId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<PaginatedResponse<Commit>> {
    const response = await this.api.get<PaginatedResponse<Commit>>("/commits", {
      params: { branchId, page, limit },
    });
    return response.data;
  }

  async getCommit(id: string): Promise<Commit> {
    const response = await this.api.get<Commit>(`/commits/${id}`);
    return response.data;
  }

  async createCommit(data: CreateCommitRequest): Promise<Commit> {
    const response = await this.api.post<Commit>("/commits", data);
    return response.data;
  }

  async importGeoJson(formData: FormData): Promise<any> {
    const response = await this.api.post("/commits/import/geojson", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  }

  async parseShapefile(formData: FormData): Promise<any> {
    const response = await this.api.post("/commits/parse/shapefile", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  }

  async exportGeoJson(branchId: string): Promise<Blob> {
    const response = await this.api.get(`/branches/${branchId}/export/geojson`, {
      responseType: "blob",
    });
    return response.data;
  }

  async exportShapefile(branchId: string): Promise<Blob> {
    const response = await this.api.get(`/branches/${branchId}/export/shapefile`, {
      responseType: "blob",
    });
    return response.data;
  }

  async getBranchHistory(
    branchId: string,
    page: number = 1,
    limit: number = 50
  ): Promise<PaginatedResponse<Commit>> {
    const response = await this.api.get<PaginatedResponse<Commit>>(
      `/commits/branch/${branchId}/history`,
      { params: { page, limit } }
    );
    return response.data;
  }

  async getFeatureHistory(
    branchId: string,
    featureId: string
  ): Promise<SpatialFeature[]> {
    const response = await this.api.get<SpatialFeature[]>(
      `/commits/feature-history/${branchId}/${featureId}`
    );
    return response.data;
  }

  async getCommitChanges(commitId: string): Promise<CommitChanges> {
    const response = await this.api.get<CommitChanges>(
      `/commits/${commitId}/changes`
    );
    return response.data;
  }

  async compareBranches(
    sourceBranchId: string,
    targetBranchId: string
  ): Promise<BranchComparison> {
    const response = await this.api.get<BranchComparison>(
      `/commits/compare/${sourceBranchId}/${targetBranchId}`
    );
    return response.data;
  }

  async getMergeRequests(): Promise<MergeRequest[]> {
    const response = await this.api.get<MergeRequest[]>("/merge-requests");
    return response.data;
  }

  async getMergeRequest(id: string): Promise<MergeRequest> {
    const response = await this.api.get<MergeRequest>(`/merge-requests/${id}`);
    return response.data;
  }

  async createMergeRequest(
    data: CreateMergeRequestRequest
  ): Promise<MergeRequest> {
    const response = await this.api.post<MergeRequest>("/merge-requests", data);
    return response.data;
  }

  async reviewMergeRequest(
    id: string,
    data: ReviewMergeRequestRequest
  ): Promise<MergeRequest> {
    const response = await this.api.patch<MergeRequest>(
      `/merge-requests/${id}/review`,
      data
    );
    return response.data;
  }

  async resolveMergeConflicts(
    data: ResolveMergeConflictsRequest
  ): Promise<MergeRequest> {
    const response = await this.api.post<MergeRequest>(
      "/merge-requests/resolve-conflicts",
      data
    );
    return response.data;
  }

  async getMergeRequestConflicts(id: string): Promise<BranchConflicts> {
    const response = await this.api.get<BranchConflicts>(
      `/merge-requests/${id}/conflicts`
    );
    return response.data;
  }

  async getBranchBounds(branchId: string): Promise<number[] | null> {
    const response = await this.api.get<{ bounds: number[] | null }>(
      `/branches/${branchId}/bounds`
    );
    return response.data.bounds;
  }
}

export default new ApiService();

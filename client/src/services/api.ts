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
  MergeRequest,
  CreateMergeRequestRequest,
  ReviewMergeRequestRequest,
  ResolveMergeConflictsRequest,
  SpatialFeature,
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

  async getLatestFeatures(branchId: string): Promise<SpatialFeature[]> {
    const response = await this.api.get<SpatialFeature[]>(
      `/branches/${branchId}/features`
    );
    return response.data;
  }

  async getCommits(branchId: string): Promise<Commit[]> {
    const response = await this.api.get<Commit[]>("/commits", {
      params: { branchId },
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

  async getBranchHistory(branchId: string): Promise<Commit[]> {
    const response = await this.api.get<Commit[]>(
      `/commits/branch/${branchId}/history`
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
}

export default new ApiService();

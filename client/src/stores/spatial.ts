import { defineStore } from "pinia";
import { ref } from "vue";
import api from "@/services/api";
import type {
  Branch,
  CreateBranchRequest,
  Commit,
  CreateCommitRequest,
  SpatialFeature,
  BranchConflicts,
} from "@/types";

export const useSpatialStore = defineStore("spatial", () => {
  const branches = ref<Branch[]>([]);
  const currentBranch = ref<Branch | null>(null);
  const branchCanEdit = ref(false);
  const branchHasOpenMergeRequest = ref(false);
  const branchHasUnresolvedConflicts = ref(false);
  const commits = ref<Commit[]>([]);
  const features = ref<SpatialFeature[]>([]);
  const conflicts = ref<BranchConflicts | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Branches
  const fetchBranches = async (datasetId: string) => {
    loading.value = true;
    error.value = null;
    try {
      branches.value = await api.getBranches(datasetId);
    } catch (err: any) {
      error.value = err.response?.data?.message || "Failed to fetch branches";
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const fetchBranch = async (id: string) => {
    loading.value = true;
    error.value = null;
    try {
      currentBranch.value = await api.getBranch(id);
      return currentBranch.value;
    } catch (err: any) {
      error.value = err.response?.data?.message || "Failed to fetch branch";
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const fetchBranchWithPermissions = async (id: string) => {
    loading.value = true;
    error.value = null;
    try {
      const result = await api.getBranchWithPermissions(id);
      currentBranch.value = result.branch;
      branchCanEdit.value = result.canEdit;
      branchHasOpenMergeRequest.value = result.hasOpenMergeRequest;
      branchHasUnresolvedConflicts.value = result.hasUnresolvedConflicts;
      return result;
    } catch (err: any) {
      error.value = err.response?.data?.message || "Failed to fetch branch";
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const createBranch = async (data: CreateBranchRequest) => {
    loading.value = true;
    error.value = null;
    try {
      const branch = await api.createBranch(data);
      branches.value.push(branch);
      return branch;
    } catch (err: any) {
      error.value = err.response?.data?.message || "Failed to create branch";
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const fetchMainBranch = async (branchId: string) => {
    loading.value = true;
    error.value = null;
    try {
      conflicts.value = await api.fetchMainBranch(branchId);
      // Refresh branch data to get updated hasUnresolvedConflicts flag
      await fetchBranchWithPermissions(branchId);
      return conflicts.value;
    } catch (err: any) {
      error.value =
        err.response?.data?.message || "Failed to fetch main branch";
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const fetchLatestFeatures = async (branchId: string) => {
    loading.value = true;
    error.value = null;
    try {
      features.value = await api.getLatestFeatures(branchId);
      return features.value;
    } catch (err: any) {
      error.value = err.response?.data?.message || "Failed to fetch features";
      throw err;
    } finally {
      loading.value = false;
    }
  };

  // Commits
  const fetchCommits = async (branchId: string) => {
    loading.value = true;
    error.value = null;
    try {
      commits.value = await api.getCommits(branchId);
    } catch (err: any) {
      error.value = err.response?.data?.message || "Failed to fetch commits";
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const createCommit = async (data: CreateCommitRequest) => {
    loading.value = true;
    error.value = null;
    try {
      const commit = await api.createCommit(data);
      commits.value.unshift(commit);
      return commit;
    } catch (err: any) {
      error.value = err.response?.data?.message || "Failed to create commit";
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const fetchBranchHistory = async (branchId: string) => {
    loading.value = true;
    error.value = null;
    try {
      commits.value = await api.getBranchHistory(branchId);
    } catch (err: any) {
      error.value = err.response?.data?.message || "Failed to fetch history";
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const clearCurrentBranch = () => {
    currentBranch.value = null;
    branchCanEdit.value = false;
    branchHasOpenMergeRequest.value = false;
    branchHasUnresolvedConflicts.value = false;
    commits.value = [];
    features.value = [];
    conflicts.value = null;
  };

  return {
    branches,
    currentBranch,
    branchCanEdit,
    branchHasOpenMergeRequest,
    branchHasUnresolvedConflicts,
    commits,
    features,
    conflicts,
    loading,
    error,
    fetchBranches,
    fetchBranch,
    fetchBranchWithPermissions,
    createBranch,
    fetchMainBranch,
    fetchLatestFeatures,
    fetchCommits,
    createCommit,
    fetchBranchHistory,
    clearCurrentBranch,
  };
});

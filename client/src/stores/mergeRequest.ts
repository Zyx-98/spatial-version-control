import { defineStore } from "pinia";
import { ref } from "vue";
import api from "@/services/api";
import type {
  MergeRequest,
  CreateMergeRequestRequest,
  ReviewMergeRequestRequest,
  ResolveMergeConflictsRequest,
  BranchConflicts,
} from "@/types";

export const useMergeRequestStore = defineStore("mergeRequest", () => {
  const mergeRequests = ref<MergeRequest[]>([]);
  const currentMergeRequest = ref<MergeRequest | null>(null);
  const conflicts = ref<BranchConflicts | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const fetchMergeRequests = async () => {
    loading.value = true;
    error.value = null;
    try {
      mergeRequests.value = await api.getMergeRequests();
    } catch (err: any) {
      error.value =
        err.response?.data?.message || "Failed to fetch merge requests";
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const fetchMergeRequest = async (id: string) => {
    loading.value = true;
    error.value = null;
    try {
      currentMergeRequest.value = await api.getMergeRequest(id);
      return currentMergeRequest.value;
    } catch (err: any) {
      error.value =
        err.response?.data?.message || "Failed to fetch merge request";
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const createMergeRequest = async (data: CreateMergeRequestRequest) => {
    loading.value = true;
    error.value = null;
    try {
      const mr = await api.createMergeRequest(data);
      mergeRequests.value.unshift(mr);
      return mr;
    } catch (err: any) {
      error.value =
        err.response?.data?.message || "Failed to create merge request";
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const reviewMergeRequest = async (
    id: string,
    data: ReviewMergeRequestRequest
  ) => {
    loading.value = true;
    error.value = null;
    try {
      const updated = await api.reviewMergeRequest(id, data);
      const index = mergeRequests.value.findIndex((mr) => mr.id === id);
      if (index !== -1) {
        mergeRequests.value[index] = updated;
      }
      if (currentMergeRequest.value?.id === id) {
        currentMergeRequest.value = updated;
      }
      return updated;
    } catch (err: any) {
      error.value =
        err.response?.data?.message || "Failed to review merge request";
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const resolveConflicts = async (data: ResolveMergeConflictsRequest) => {
    loading.value = true;
    error.value = null;
    try {
      const updated = await api.resolveMergeConflicts(data);
      const index = mergeRequests.value.findIndex(
        (mr) => mr.id === data.mergeRequestId
      );
      if (index !== -1) {
        mergeRequests.value[index] = updated;
      }
      if (currentMergeRequest.value?.id === data.mergeRequestId) {
        currentMergeRequest.value = updated;
      }
      return updated;
    } catch (err: any) {
      error.value =
        err.response?.data?.message || "Failed to resolve conflicts";
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const fetchConflicts = async (id: string) => {
    loading.value = true;
    error.value = null;
    try {
      conflicts.value = await api.getMergeRequestConflicts(id);
      return conflicts.value;
    } catch (err: any) {
      error.value = err.response?.data?.message || "Failed to fetch conflicts";
      throw err;
    } finally {
      loading.value = false;
    }
  };

  return {
    mergeRequests,
    currentMergeRequest,
    conflicts,
    loading,
    error,
    fetchMergeRequests,
    fetchMergeRequest,
    createMergeRequest,
    reviewMergeRequest,
    resolveConflicts,
    fetchConflicts,
  };
});

import { defineStore } from "pinia";
import { ref } from "vue";
import api from "@/services/api";
import type { Dataset, CreateDatasetRequest } from "@/types";

export const useDatasetStore = defineStore("dataset", () => {
  const datasets = ref<Dataset[]>([]);
  const currentDataset = ref<Dataset | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const fetchDatasets = async () => {
    loading.value = true;
    error.value = null;
    try {
      datasets.value = await api.getDatasets();
    } catch (err: any) {
      error.value = err.response?.data?.message || "Failed to fetch datasets";
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const fetchDataset = async (id: string) => {
    loading.value = true;
    error.value = null;
    try {
      currentDataset.value = await api.getDataset(id);
      return currentDataset.value;
    } catch (err: any) {
      error.value = err.response?.data?.message || "Failed to fetch dataset";
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const createDataset = async (data: CreateDatasetRequest) => {
    loading.value = true;
    error.value = null;
    try {
      const dataset = await api.createDataset(data);
      datasets.value.push(dataset);
      return dataset;
    } catch (err: any) {
      error.value = err.response?.data?.message || "Failed to create dataset";
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const updateDataset = async (
    id: string,
    data: Partial<CreateDatasetRequest>
  ) => {
    loading.value = true;
    error.value = null;
    try {
      const updated = await api.updateDataset(id, data);
      const index = datasets.value.findIndex((d) => d.id === id);
      if (index !== -1) {
        datasets.value[index] = updated;
      }
      if (currentDataset.value?.id === id) {
        currentDataset.value = updated;
      }
      return updated;
    } catch (err: any) {
      error.value = err.response?.data?.message || "Failed to update dataset";
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const deleteDataset = async (id: string) => {
    loading.value = true;
    error.value = null;
    try {
      await api.deleteDataset(id);
      datasets.value = datasets.value.filter((d) => d.id !== id);
      if (currentDataset.value?.id === id) {
        currentDataset.value = null;
      }
    } catch (err: any) {
      error.value = err.response?.data?.message || "Failed to delete dataset";
      throw err;
    } finally {
      loading.value = false;
    }
  };

  return {
    datasets,
    currentDataset,
    loading,
    error,
    fetchDatasets,
    fetchDataset,
    createDataset,
    updateDataset,
    deleteDataset,
  };
});

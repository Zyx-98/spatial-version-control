<template>
  <div class="max-w-7xl mx-auto">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-3xl font-bold text-gray-900">Datasets</h1>
      <button
        v-if="authStore.isAdmin"
        @click="showCreateModal = true"
        class="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
      >
        Create Dataset
      </button>
    </div>

    <div v-if="datasetStore.loading" class="text-center py-12">
      <div
        class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"
      ></div>
    </div>

    <div v-else-if="datasetStore.error" class="bg-red-50 p-4 rounded-md">
      <p class="text-red-800">{{ datasetStore.error }}</p>
    </div>

    <div
      v-else-if="datasetStore.datasets.length === 0"
      class="text-center py-12"
    >
      <p class="text-gray-500 text-lg">No datasets found</p>
      <p v-if="authStore.isAdmin" class="text-gray-400 mt-2">
        Create your first dataset to get started
      </p>
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <div
        v-for="dataset in datasetStore.datasets"
        :key="dataset.id"
        class="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow cursor-pointer"
        @click="router.push(`/datasets/${dataset.id}`)"
      >
        <h3 class="text-xl font-semibold text-gray-900 mb-2">
          {{ dataset.name }}
        </h3>
        <p class="text-gray-600 text-sm mb-4">
          {{ dataset.description || "No description" }}
        </p>
        <div class="flex justify-between items-center text-sm text-gray-500">
          <span>{{ dataset.branches?.length || 0 }} branches</span>
          <span>{{ formatDate(dataset.createdAt) }}</span>
        </div>
      </div>
    </div>

    <!-- Create Dataset Modal -->
    <div
      v-if="showCreateModal"
      class="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50"
    >
      <div class="bg-white rounded-lg p-6 max-w-md w-full">
        <h2 class="text-2xl font-bold mb-4">Create Dataset</h2>
        <form @submit.prevent="handleCreate">
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1"
                >Name</label
              >
              <input
                v-model="newDataset.name"
                type="text"
                required
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1"
                >Description</label
              >
              <textarea
                v-model="newDataset.description"
                rows="3"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              ></textarea>
            </div>
          </div>
          <div class="mt-6 flex justify-end space-x-3">
            <button
              type="button"
              @click="showCreateModal = false"
              class="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              :disabled="datasetStore.loading"
              class="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useDatasetStore } from "@/stores/dataset";
import { format } from "date-fns";

const router = useRouter();
const authStore = useAuthStore();
const datasetStore = useDatasetStore();

const showCreateModal = ref(false);
const newDataset = reactive({
  name: "",
  description: "",
});

const formatDate = (date: string) => {
  return format(new Date(date), "MMM dd, yyyy");
};

const handleCreate = async () => {
  try {
    await datasetStore.createDataset(newDataset);
    showCreateModal.value = false;
    newDataset.name = "";
    newDataset.description = "";
  } catch (error) {
    console.error("Failed to create dataset:", error);
  }
};

onMounted(() => {
  datasetStore.fetchDatasets();
});
</script>

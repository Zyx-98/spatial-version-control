<template>
  <div class="max-w-7xl mx-auto">
    <div v-if="loading" class="text-center py-12">
      <div
        class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"
      ></div>
    </div>

    <div v-else-if="dataset">
      <!-- Header -->
      <div class="mb-6">
        <div class="flex items-center space-x-2 text-sm text-gray-500 mb-2">
          <router-link to="/datasets" class="hover:text-primary-600"
            >Datasets</router-link
          >
          <span>/</span>
          <span class="text-gray-900">{{ dataset.name }}</span>
        </div>
        <div class="flex justify-between items-start">
          <div>
            <h1 class="text-3xl font-bold text-gray-900">{{ dataset.name }}</h1>
            <p class="text-gray-600 mt-2">
              {{ dataset.description || "No description" }}
            </p>
          </div>
          <button
            @click="showCreateBranchModal = true"
            class="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
          >
            Create Branch
          </button>
        </div>
      </div>

      <!-- Branches List -->
      <div class="bg-white rounded-lg shadow">
        <div class="px-6 py-4 border-b border-gray-200">
          <h2 class="text-xl font-semibold text-gray-900">Branches</h2>
        </div>
        <div class="divide-y divide-gray-200">
          <div
            v-for="branch in branches"
            :key="branch.id"
            class="px-6 py-4 hover:bg-gray-50 cursor-pointer"
            @click="router.push(`/datasets/${datasetId}/branches/${branch.id}`)"
          >
            <div class="flex justify-between items-center">
              <div class="flex items-center space-x-3">
                <svg
                  class="h-5 w-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                  />
                </svg>
                <div>
                  <div class="flex items-center space-x-2">
                    <span class="font-medium text-gray-900">{{
                      branch.name
                    }}</span>
                    <span
                      v-if="branch.isMain"
                      class="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full"
                    >
                      Main
                    </span>
                  </div>
                  <p class="text-sm text-gray-500">
                    Created {{ formatDate(branch.createdAt) }}
                  </p>
                </div>
              </div>
              <div class="text-right">
                <button
                  @click.stop="viewBranch(branch.id)"
                  class="text-primary-600 hover:text-primary-700 text-sm font-medium"
                >
                  View Details →
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Create Branch Modal -->
    <div
      v-if="showCreateBranchModal"
      class="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50"
    >
      <div class="bg-white rounded-lg p-6 max-w-md w-full">
        <h2 class="text-2xl font-bold mb-4">Create Branch</h2>
        <form @submit.prevent="handleCreateBranch">
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-1"
              >Branch Name</label
            >
            <input
              v-model="newBranchName"
              type="text"
              required
              placeholder="feature/my-branch"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
            <p class="mt-1 text-xs text-gray-500">
              Branch will be created from the main branch
            </p>
          </div>
          <div class="flex justify-end space-x-3">
            <button
              type="button"
              @click="showCreateBranchModal = false"
              class="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              :disabled="spatialStore.loading"
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
import { ref, onMounted, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useDatasetStore } from "@/stores/dataset";
import { useSpatialStore } from "@/stores/spatial";
import { format } from "date-fns";

const route = useRoute();
const router = useRouter();
const datasetStore = useDatasetStore();
const spatialStore = useSpatialStore();

const datasetId = route.params.id as string;
const loading = ref(false);
const showCreateBranchModal = ref(false);
const newBranchName = ref("");

const dataset = computed(() => datasetStore.currentDataset);
const branches = computed(() => spatialStore.branches);

const formatDate = (date: string) => {
  return format(new Date(date), "MMM dd, yyyy");
};

const viewBranch = (branchId: string) => {
  router.push(`/datasets/${datasetId}/branches/${branchId}`);
};

const handleCreateBranch = async () => {
  try {
    await spatialStore.createBranch({
      name: newBranchName.value,
      datasetId,
    });
    showCreateBranchModal.value = false;
    newBranchName.value = "";
  } catch (error) {
    console.error("Failed to create branch:", error);
  }
};

onMounted(async () => {
  loading.value = true;
  try {
    await datasetStore.fetchDataset(datasetId);
    await spatialStore.fetchBranches(datasetId);
  } catch (error) {
    console.error("Failed to load dataset:", error);
  } finally {
    loading.value = false;
  }
});
</script>

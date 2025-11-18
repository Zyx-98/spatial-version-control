<template>
  <div class="max-w-7xl mx-auto">
    <div v-if="loading" class="text-center py-12">
      <div
        class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"
      ></div>
    </div>

    <div v-else-if="branch">
      <!-- Header -->
      <div class="mb-6">
        <div class="flex items-center space-x-2 text-sm text-gray-500 mb-2">
          <router-link to="/datasets" class="hover:text-primary-600"
            >Datasets</router-link
          >
          <span>/</span>
          <router-link
            :to="`/datasets/${datasetId}`"
            class="hover:text-primary-600"
          >
            {{ datasetId }}
          </router-link>
          <span>/</span>
          <span class="text-gray-900">{{ branch.name }}</span>
        </div>
        <div class="flex justify-between items-start">
          <div>
            <div class="flex items-center space-x-3">
              <h1 class="text-3xl font-bold text-gray-900">
                {{ branch.name }}
              </h1>
              <span
                v-if="branch.isMain"
                class="px-3 py-1 text-sm bg-green-100 text-green-800 rounded-full"
              >
                Main Branch
              </span>
              <span
                v-if="branch.isDisabled"
                class="px-3 py-1 text-sm bg-red-100 text-red-800 rounded-full"
              >
                Disabled (Merged)
              </span>
            </div>
          </div>
          <div class="flex space-x-3">
            <button
              v-if="!branch.isMain && !branch.isDisabled"
              @click="handleFetchMain"
              class="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Fetch Main
            </button>
            <button
              v-if="canEdit"
              @click="
                router.push(
                  `/datasets/${datasetId}/branches/${branchId}/commit`
                )
              "
              class="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
            >
              Create Commit
            </button>
            <button
              v-if="!branch.isMain && !branch.isDisabled"
              @click="handleCreateMergeRequest"
              :disabled="hasOpenMergeRequest"
              :class="[
                'px-4 py-2 rounded-md',
                hasOpenMergeRequest || branch.isDisabled
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-green-600 text-white hover:bg-green-700',
              ]"
              :title="
                hasOpenMergeRequest
                  ? 'This branch already has an open merge request'
                  : ''
              "
            >
              {{
                hasOpenMergeRequest
                  ? "PR Already Open"
                  : "Create Merge Request"
              }}
            </button>
          </div>
        </div>
      </div>

      <!-- Map -->
      <div class="bg-white rounded-lg shadow mb-6">
        <div class="px-6 py-4 border-b border-gray-200">
          <h2 class="text-xl font-semibold text-gray-900">Spatial Features</h2>
        </div>
        <div class="p-4">
          <MapViewer :features="features" :height="500" />
        </div>
      </div>

      <!-- Commits -->
      <div class="bg-white rounded-lg shadow">
        <div class="px-6 py-4 border-b border-gray-200">
          <h2 class="text-xl font-semibold text-gray-900">Commit History</h2>
        </div>
        <div class="divide-y divide-gray-200">
          <div
            v-if="commits.length === 0"
            class="px-6 py-8 text-center text-gray-500"
          >
            No commits yet
          </div>
          <div
            v-for="commit in commits"
            :key="commit.id"
            @click="viewCommitChanges(commit.id)"
            class="px-6 py-4 hover:bg-gray-50 cursor-pointer"
          >
            <div class="flex justify-between items-start">
              <div>
                <p class="font-medium text-gray-900">{{ commit.message }}</p>
                <div
                  class="mt-1 flex items-center space-x-4 text-sm text-gray-500"
                >
                  <span>{{ commit.author?.username || "Unknown" }}</span>
                  <span>{{ formatDate(commit.createdAt) }}</span>
                  <span>{{ commit.features?.length || 0 }} changes</span>
                </div>
              </div>
              <button
                class="text-primary-600 hover:text-primary-800 text-sm font-medium"
              >
                View Changes
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Commit Changes Modal -->
    <div
      v-if="showCommitChangesModal && selectedCommitChanges"
      class="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-[1000]"
    >
      <div
        class="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] overflow-y-auto"
      >
        <EnhancedCommitChanges
          :commit="selectedCommitChanges.commit"
          :changes="selectedCommitChanges.changes"
        />
        <div class="p-4 border-t flex justify-end">
          <button
            @click="showCommitChangesModal = false"
            class="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>

    <!-- Conflicts Modal -->
    <div
      v-if="showConflictsModal"
      class="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-[1000]"
    >
      <div
        class="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
      >
        <h2 class="text-2xl font-bold mb-4">Conflicts Detected</h2>
        <div v-if="conflicts && conflicts.hasConflicts">
          <p class="text-gray-600 mb-4">
            {{ conflicts.conflicts.length }} conflicts found with the main
            branch
          </p>
          <div class="space-y-4">
            <div
              v-for="(conflict, index) in conflicts.conflicts"
              :key="index"
              class="border border-red-200 rounded-lg p-4 bg-red-50"
            >
              <p class="font-medium text-red-900">
                Feature ID: {{ conflict.featureId }}
              </p>
              <p class="text-sm text-red-700">
                Type: {{ conflict.conflictType }}
              </p>
            </div>
          </div>
        </div>
        <div v-else>
          <p class="text-green-600">
            No conflicts found. Branch is up to date with main.
          </p>
        </div>
        <div class="mt-6 flex justify-end">
          <button
            @click="showConflictsModal = false"
            class="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useSpatialStore } from "@/stores/spatial";
import { useMergeRequestStore } from "@/stores/mergeRequest";
import { format } from "date-fns";
import MapViewer from "@/components/MapViewer.vue";
import EnhancedCommitChanges from "@/components/EnhancedCommitChanges.vue";
import api from "@/services/api";
import type { CommitChanges as CommitChangesType } from "@/types";

const route = useRoute();
const router = useRouter();
const spatialStore = useSpatialStore();
const mergeRequestStore = useMergeRequestStore();

const datasetId = route.params.datasetId as string;
const branchId = route.params.branchId as string;
const loading = ref(false);
const showConflictsModal = ref(false);
const showCommitChangesModal = ref(false);
const selectedCommitChanges = ref<CommitChangesType | null>(null);

const branch = computed(() => spatialStore.currentBranch);
const commits = computed(() => spatialStore.commits);
const features = computed(() => spatialStore.features);
const conflicts = computed(() => spatialStore.conflicts);
const canEdit = computed(() => spatialStore.branchCanEdit);
const hasOpenMergeRequest = computed(
  () => spatialStore.branchHasOpenMergeRequest
);

const formatDate = (date: string) => {
  return format(new Date(date), "MMM dd, yyyy HH:mm");
};

const handleFetchMain = async () => {
  try {
    await spatialStore.fetchMainBranch(branchId);
    showConflictsModal.value = true;
  } catch (error) {
    console.error("Failed to fetch main:", error);
  }
};

const viewCommitChanges = async (commitId: string) => {
  try {
    selectedCommitChanges.value = await api.getCommitChanges(commitId);
    showCommitChangesModal.value = true;
  } catch (error) {
    console.error("Failed to load commit changes:", error);
  }
};

const handleCreateMergeRequest = async () => {
  try {
    // Get main branch
    const mainBranch = spatialStore.branches.find(
      (b) => b.isMain && b.datasetId === datasetId
    );
    if (!mainBranch) {
      alert("Main branch not found");
      return;
    }

    await mergeRequestStore.createMergeRequest({
      title: `Merge ${branch.value?.name} into main`,
      description: `Merge request from ${branch.value?.name}`,
      sourceBranchId: branchId,
      targetBranchId: mainBranch.id,
    });

    router.push("/merge-requests");
  } catch (error: any) {
    alert(error.response?.data?.message || "Failed to create merge request");
  }
};

onMounted(async () => {
  loading.value = true;
  try {
    await spatialStore.fetchBranchWithPermissions(branchId);
    await spatialStore.fetchCommits(branchId);
    await spatialStore.fetchLatestFeatures(branchId);
    await spatialStore.fetchBranches(datasetId);
  } catch (error) {
    console.error("Failed to load branch:", error);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="max-w-7xl mx-auto">
    <div v-if="loading" class="text-center py-12">
      <div
        class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"
      ></div>
    </div>

    <div v-else-if="mergeRequest">
      <!-- Header -->
      <div class="mb-6">
        <div class="flex items-center space-x-2 text-sm text-gray-500 mb-2">
          <router-link to="/merge-requests" class="hover:text-primary-600">
            Merge Requests
          </router-link>
          <span>/</span>
          <span class="text-gray-900"
            >#{{ mergeRequest.id.substring(0, 8) }}</span
          >
        </div>
        <div class="flex justify-between items-start">
          <div>
            <div class="flex items-center space-x-3">
              <h1 class="text-3xl font-bold text-gray-900">
                {{ mergeRequest.title }}
              </h1>
              <span
                :class="[
                  'px-3 py-1 text-sm font-medium rounded-full',
                  getStatusClass(mergeRequest.status),
                ]"
              >
                {{ mergeRequest.status }}
              </span>
            </div>
            <p class="text-gray-600 mt-2">{{ mergeRequest.description }}</p>
          </div>
        </div>
      </div>

      <!-- Info Cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div class="bg-white rounded-lg shadow p-6">
          <h3 class="text-sm font-medium text-gray-500 mb-1">From</h3>
          <p class="text-lg font-semibold">
            {{ mergeRequest.sourceBranch?.name }}
          </p>
        </div>
        <div class="bg-white rounded-lg shadow p-6">
          <h3 class="text-sm font-medium text-gray-500 mb-1">To</h3>
          <p class="text-lg font-semibold">
            {{ mergeRequest.targetBranch?.name }}
          </p>
        </div>
        <div class="bg-white rounded-lg shadow p-6">
          <h3 class="text-sm font-medium text-gray-500 mb-1">Created By</h3>
          <p class="text-lg font-semibold">
            {{ mergeRequest.createdBy?.username }}
          </p>
        </div>
      </div>

      <!-- Conflicts Warning -->
      <div
        v-if="mergeRequest.hasConflicts"
        class="bg-red-50 border border-red-200 rounded-lg p-6 mb-6"
      >
        <div class="flex items-start">
          <svg
            class="h-6 w-6 text-red-600 mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <div class="ml-3 flex-1">
            <h3 class="text-lg font-medium text-red-900">
              Merge Conflicts Detected
            </h3>
            <p class="text-red-700 mt-1">
              This merge request has
              {{ conflicts?.conflicts.length || 0 }} conflicts that must be
              resolved before merging.
            </p>
            <button
              @click="showConflictsModal = true"
              class="mt-3 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              View Conflicts
            </button>
          </div>
        </div>
      </div>

      <!-- Actions (Admin Only) -->
      <div
        v-if="authStore.isAdmin && mergeRequest.status === 'open'"
        class="bg-white rounded-lg shadow p-6 mb-6"
      >
        <h2 class="text-xl font-semibold mb-4">Review Actions</h2>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1"
              >Review Comment</label
            >
            <textarea
              v-model="reviewComment"
              rows="3"
              placeholder="Add your review comments..."
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            ></textarea>
          </div>
          <div class="flex space-x-3">
            <button
              @click="handleReview('approved')"
              :disabled="mergeRequest.hasConflicts || mergeRequestStore.loading"
              class="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Approve & Merge
            </button>
            <button
              @click="handleReview('rejected')"
              :disabled="mergeRequestStore.loading"
              class="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
            >
              Reject
            </button>
          </div>
          <p v-if="mergeRequest.hasConflicts" class="text-sm text-red-600">
            Cannot approve while conflicts exist. Resolve conflicts first.
          </p>
        </div>
      </div>

      <!-- Review Info -->
      <div
        v-if="mergeRequest.reviewedBy"
        class="bg-white rounded-lg shadow p-6"
      >
        <h2 class="text-xl font-semibold mb-4">Review</h2>
        <div class="space-y-2">
          <p class="text-gray-700">
            <span class="font-medium">Reviewed by:</span>
            {{ mergeRequest.reviewedBy.username }}
          </p>
          <p v-if="mergeRequest.reviewComment" class="text-gray-700">
            <span class="font-medium">Comment:</span>
            {{ mergeRequest.reviewComment }}
          </p>
          <p v-if="mergeRequest.mergedAt" class="text-gray-700">
            <span class="font-medium">Merged at:</span>
            {{ formatDate(mergeRequest.mergedAt) }}
          </p>
        </div>
      </div>
    </div>

    <!-- Conflicts Modal -->
    <div
      v-if="showConflictsModal"
      class="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50"
    >
      <div
        class="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto"
      >
        <h2 class="text-2xl font-bold mb-4">Merge Conflicts</h2>

        <div v-if="conflicts && conflicts.hasConflicts" class="space-y-4">
          <div
            v-for="(conflict, index) in conflicts.conflicts"
            :key="index"
            class="border border-red-200 rounded-lg p-4 bg-red-50"
          >
            <div class="flex justify-between items-start mb-3">
              <div>
                <p class="font-medium text-red-900">
                  Feature ID: {{ conflict.featureId }}
                </p>
                <p class="text-sm text-red-700">
                  Type: {{ conflict.conflictType }}
                </p>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4 mt-4">
              <div class="bg-white rounded p-3">
                <h4 class="font-medium text-sm text-gray-700 mb-2">
                  Main Branch Version
                </h4>
                <pre class="text-xs bg-gray-50 p-2 rounded overflow-auto">{{
                  JSON.stringify(conflict.mainVersion, null, 2)
                }}</pre>
              </div>
              <div class="bg-white rounded p-3">
                <h4 class="font-medium text-sm text-gray-700 mb-2">
                  Feature Branch Version
                </h4>
                <pre class="text-xs bg-gray-50 p-2 rounded overflow-auto">{{
                  JSON.stringify(conflict.branchVersion, null, 2)
                }}</pre>
              </div>
            </div>

            <div class="mt-3 flex space-x-2">
              <button
                @click="resolveConflict(conflict.featureId, 'use_main')"
                class="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Use Main
              </button>
              <button
                @click="resolveConflict(conflict.featureId, 'use_branch')"
                class="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
              >
                Use Branch
              </button>
            </div>
          </div>
        </div>

        <div class="mt-6 flex justify-end space-x-3">
          <button
            @click="showConflictsModal = false"
            class="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
          <button
            v-if="resolutions.length > 0"
            @click="handleResolveConflicts"
            :disabled="mergeRequestStore.loading"
            class="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
          >
            Save Resolutions
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useMergeRequestStore } from "@/stores/mergeRequest";
import { MergeRequestStatus } from "@/types";
import { format } from "date-fns";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const mergeRequestStore = useMergeRequestStore();

const mergeRequestId = route.params.id as string;
const loading = ref(false);
const showConflictsModal = ref(false);
const reviewComment = ref("");
const resolutions = ref<
  Array<{ featureId: string; resolution: "use_main" | "use_branch" }>
>([]);

const mergeRequest = computed(() => mergeRequestStore.currentMergeRequest);
const conflicts = computed(() => mergeRequestStore.conflicts);

const getStatusClass = (status: MergeRequestStatus) => {
  switch (status) {
    case MergeRequestStatus.OPEN:
      return "bg-blue-100 text-blue-800";
    case MergeRequestStatus.APPROVED:
      return "bg-green-100 text-green-800";
    case MergeRequestStatus.MERGED:
      return "bg-purple-100 text-purple-800";
    case MergeRequestStatus.REJECTED:
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
};

const formatDate = (date: string) => {
  return format(new Date(date), "MMM dd, yyyy HH:mm");
};

const handleReview = async (status: "approved" | "rejected") => {
  if (
    !confirm(
      `Are you sure you want to ${status === "approved" ? "approve and merge" : "reject"} this merge request?`
    )
  ) {
    return;
  }

  try {
    await mergeRequestStore.reviewMergeRequest(mergeRequestId, {
      status:
        status === "approved"
          ? MergeRequestStatus.APPROVED
          : MergeRequestStatus.REJECTED,
      reviewComment: reviewComment.value,
    });
    alert(`Merge request ${status}!`);
    router.push("/merge-requests");
  } catch (error: any) {
    alert(error.response?.data?.message || `Failed to ${status} merge request`);
  }
};

const resolveConflict = (
  featureId: string,
  resolution: "use_main" | "use_branch"
) => {
  const existingIndex = resolutions.value.findIndex(
    (r) => r.featureId === featureId
  );
  if (existingIndex >= 0) {
    resolutions.value[existingIndex].resolution = resolution;
  } else {
    resolutions.value.push({ featureId, resolution });
  }
};

const handleResolveConflicts = async () => {
  try {
    await mergeRequestStore.resolveConflicts({
      mergeRequestId,
      resolutions: resolutions.value,
    });
    alert("Conflicts resolved!");
    showConflictsModal.value = false;
    resolutions.value = [];
    // Reload merge request
    await loadMergeRequest();
  } catch (error: any) {
    alert(error.response?.data?.message || "Failed to resolve conflicts");
  }
};

const loadMergeRequest = async () => {
  loading.value = true;
  try {
    await mergeRequestStore.fetchMergeRequest(mergeRequestId);
    if (mergeRequest.value?.hasConflicts) {
      await mergeRequestStore.fetchConflicts(mergeRequestId);
    }
  } catch (error) {
    console.error("Failed to load merge request:", error);
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  loadMergeRequest();
});
</script>

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

      <!-- Branch Comparison -->
      <div class="mb-6">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-xl font-semibold text-gray-900">Changes</h2>
        </div>
        <div v-if="loadingComparison" class="text-center py-12">
          <div
            class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"
          ></div>
          <p class="mt-4 text-gray-600">Loading comparison...</p>
        </div>
        <EnhancedBranchComparison
          v-else-if="branchComparison && mergeRequest"
          :summary="branchComparison.summary"
          :changes="branchComparison.changes"
          :sourceLabel="mergeRequest.sourceBranch?.name || 'Source'"
          :targetLabel="mergeRequest.targetBranch?.name || 'Target'"
        />
        <div
          v-else-if="!loadingComparison"
          class="text-center py-8 text-gray-500"
        >
          No comparison data available
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

    <!-- Enhanced Conflicts Modal -->
    <div
      v-if="showConflictsModal"
      class="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-[1000] p-4"
    >
      <div
        class="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col"
      >
        <!-- Modal Header -->
        <div class="bg-red-600 text-white px-6 py-4">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-2xl font-bold">Resolve Merge Conflicts</h2>
              <p class="text-red-100 text-sm mt-1">
                {{ conflicts?.conflicts.length || 0 }} conflict(s) detected -
                {{ resolutions.length }} resolved
              </p>
            </div>
            <button
              @click="showConflictsModal = false"
              class="text-white hover:bg-red-700 rounded-full p-2 transition"
            >
              <svg
                class="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        <!-- Conflicts Content -->
        <div class="flex-1 overflow-y-auto p-6">
          <div
            v-if="conflicts && conflicts.hasConflicts"
            class="space-y-6"
          >
            <div
              v-for="(conflict, index) in conflicts.conflicts"
              :key="index"
              class="border rounded-lg overflow-hidden transition"
              :class="
                getResolution(conflict.featureId)
                  ? 'border-green-300 bg-green-50'
                  : 'border-red-300 bg-white'
              "
            >
              <!-- Conflict Header -->
              <div
                class="px-4 py-3 flex items-center justify-between"
                :class="
                  getResolution(conflict.featureId)
                    ? 'bg-green-100'
                    : 'bg-red-100'
                "
              >
                <div class="flex items-center space-x-3">
                  <div
                    class="w-8 h-8 rounded-full flex items-center justify-center"
                    :class="
                      getResolution(conflict.featureId)
                        ? 'bg-green-600 text-white'
                        : 'bg-red-600 text-white'
                    "
                  >
                    <svg
                      v-if="getResolution(conflict.featureId)"
                      class="w-5 h-5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clip-rule="evenodd"
                      />
                    </svg>
                    <span v-else class="font-bold">{{ index + 1 }}</span>
                  </div>
                  <div>
                    <p class="font-semibold text-gray-900">
                      {{ conflict.featureId }}
                    </p>
                    <p class="text-sm text-gray-600">
                      {{ formatConflictType(conflict.conflictType) }}
                    </p>
                  </div>
                </div>
                <div
                  v-if="getResolution(conflict.featureId)"
                  class="px-3 py-1 bg-green-600 text-white text-sm rounded-full font-medium"
                >
                  {{
                    getResolution(conflict.featureId) === "use_main"
                      ? "Using Main"
                      : "Using Branch"
                  }}
                </div>
              </div>

              <!-- Conflict Details -->
              <div class="p-4">
                <!-- Property Differences -->
                <div v-if="hasPropertyDiff(conflict)" class="mb-4">
                  <h4 class="font-semibold text-gray-700 mb-2 flex items-center">
                    <svg
                      class="w-4 h-4 mr-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    Property Changes
                  </h4>
                  <div class="space-y-1">
                    <div
                      v-for="key in getPropertyKeys(conflict)"
                      :key="key"
                      class="text-sm"
                    >
                      <div
                        v-if="isPropertyChanged(conflict, key)"
                        class="bg-yellow-50 border border-yellow-200 rounded p-2"
                      >
                        <div class="font-medium text-gray-700">{{ key }}:</div>
                        <div class="grid grid-cols-2 gap-2 mt-1">
                          <div class="text-red-700 flex items-start">
                            <span class="text-red-600 mr-1">-</span>
                            <span class="break-all">{{
                              formatValue(conflict.mainVersion?.properties?.[key])
                            }}</span>
                          </div>
                          <div class="text-green-700 flex items-start">
                            <span class="text-green-600 mr-1">+</span>
                            <span class="break-all">{{
                              formatValue(conflict.branchVersion?.properties?.[key])
                            }}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Geometry Differences -->
                <div v-if="hasGeometryDiff(conflict)" class="mb-4">
                  <h4 class="font-semibold text-gray-700 mb-2 flex items-center">
                    <svg
                      class="w-4 h-4 mr-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                      />
                    </svg>
                    Geometry Changed
                  </h4>
                  <div class="bg-orange-50 border border-orange-300 rounded-lg p-4">
                    <div class="flex items-start space-x-2 mb-3">
                      <svg
                        class="w-5 h-5 text-orange-600 mt-0.5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                          clip-rule="evenodd"
                        />
                      </svg>
                      <p class="text-sm text-orange-800">
                        The feature coordinates have been modified in both branches.
                        Review the differences and choose which version to keep.
                      </p>
                    </div>

                    <!-- Map Comparison -->
                    <ConflictMapComparison
                      :mainGeometry="conflict.mainVersion?.geometry"
                      :branchGeometry="conflict.branchVersion?.geometry"
                    />

                    <div v-if="getCoordinateDiffSummary(conflict)" class="mt-3 text-xs text-orange-700 bg-orange-100 rounded px-3 py-2">
                      <strong>Change Summary:</strong> {{ getCoordinateDiffSummary(conflict) }}
                    </div>
                  </div>
                </div>

                <!-- Resolution Buttons -->
                <div class="flex space-x-3 mt-4">
                  <button
                    @click="resolveConflict(conflict.featureId, 'use_main')"
                    class="flex-1 py-3 px-4 rounded-lg font-medium transition"
                    :class="
                      getResolution(conflict.featureId) === 'use_main'
                        ? 'bg-blue-600 text-white shadow-lg'
                        : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                    "
                  >
                    <div class="flex items-center justify-center">
                      <svg
                        v-if="getResolution(conflict.featureId) === 'use_main'"
                        class="w-5 h-5 mr-2"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clip-rule="evenodd"
                        />
                      </svg>
                      Use Main Branch
                    </div>
                  </button>
                  <button
                    @click="resolveConflict(conflict.featureId, 'use_branch')"
                    class="flex-1 py-3 px-4 rounded-lg font-medium transition"
                    :class="
                      getResolution(conflict.featureId) === 'use_branch'
                        ? 'bg-green-600 text-white shadow-lg'
                        : 'bg-green-100 text-green-700 hover:bg-green-200'
                    "
                  >
                    <div class="flex items-center justify-center">
                      <svg
                        v-if="getResolution(conflict.featureId) === 'use_branch'"
                        class="w-5 h-5 mr-2"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clip-rule="evenodd"
                        />
                      </svg>
                      Use Feature Branch
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="text-center py-8 text-gray-500">
            No conflicts found
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="border-t bg-gray-50 px-6 py-4 flex justify-between items-center">
          <div class="text-sm text-gray-600">
            <span v-if="resolutions.length > 0">
              {{ resolutions.length }} of
              {{ conflicts?.conflicts.length || 0 }} conflicts resolved
            </span>
            <span v-else class="text-red-600 font-medium">
              Please resolve all conflicts before saving
            </span>
          </div>
          <div class="flex space-x-3">
            <button
              @click="showConflictsModal = false"
              class="px-5 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 font-medium transition"
            >
              Cancel
            </button>
            <button
              v-if="resolutions.length === conflicts?.conflicts.length"
              @click="handleResolveConflicts"
              :disabled="mergeRequestStore.loading"
              class="px-5 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 font-medium transition shadow-lg"
            >
              {{
                mergeRequestStore.loading
                  ? "Saving..."
                  : `Save ${resolutions.length} Resolution(s)`
              }}
            </button>
          </div>
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
import type { BranchComparison as BranchComparisonType } from "@/types";
import { format } from "date-fns";
import EnhancedBranchComparison from "@/components/EnhancedBranchComparison.vue";
import ConflictMapComparison from "@/components/ConflictMapComparison.vue";
import api from "@/services/api";

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
const branchComparison = ref<BranchComparisonType | null>(null);
const loadingComparison = ref(false);

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

// Helper methods for conflict resolution UI
const getResolution = (featureId: string) => {
  const resolution = resolutions.value.find((r) => r.featureId === featureId);
  return resolution?.resolution;
};

const formatConflictType = (type: string) => {
  const types: Record<string, string> = {
    MODIFY_MODIFY: "Both branches modified this feature",
    DELETE_MODIFY: "Deleted in one branch, modified in another",
    MODIFY_DELETE: "Modified in one branch, deleted in another",
  };
  return types[type] || type;
};

const hasPropertyDiff = (conflict: any) => {
  if (!conflict.mainVersion?.properties || !conflict.branchVersion?.properties)
    return false;
  return (
    JSON.stringify(conflict.mainVersion.properties) !==
    JSON.stringify(conflict.branchVersion.properties)
  );
};

const hasGeometryDiff = (conflict: any) => {
  if (!conflict.mainVersion?.geometry || !conflict.branchVersion?.geometry)
    return false;
  return (
    JSON.stringify(conflict.mainVersion.geometry) !==
    JSON.stringify(conflict.branchVersion.geometry)
  );
};

const getPropertyKeys = (conflict: any) => {
  const mainKeys = Object.keys(conflict.mainVersion?.properties || {});
  const branchKeys = Object.keys(conflict.branchVersion?.properties || {});
  return Array.from(new Set([...mainKeys, ...branchKeys]));
};

const isPropertyChanged = (conflict: any, key: string) => {
  const mainValue = conflict.mainVersion?.properties?.[key];
  const branchValue = conflict.branchVersion?.properties?.[key];
  return JSON.stringify(mainValue) !== JSON.stringify(branchValue);
};

const formatValue = (value: any) => {
  if (value === null || value === undefined) return "N/A";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const countCoordinates = (geometry: any): number => {
  if (!geometry || !geometry.coordinates) return 0;
  const coords = geometry.coordinates;

  // Handle different geometry types
  if (geometry.type === 'Point') {
    return 1;
  } else if (geometry.type === 'LineString' || geometry.type === 'MultiPoint') {
    return Array.isArray(coords) ? coords.length : 0;
  } else if (geometry.type === 'Polygon') {
    return Array.isArray(coords[0]) ? coords[0].length : 0;
  } else if (geometry.type === 'MultiLineString') {
    return coords.reduce((sum: number, line: any[]) => sum + line.length, 0);
  } else if (geometry.type === 'MultiPolygon') {
    return coords.reduce((sum: number, polygon: any[]) =>
      sum + (polygon[0]?.length || 0), 0
    );
  }
  return 0;
};

const getCoordinateDiffSummary = (conflict: any) => {
  const mainGeom = conflict.mainVersion?.geometry;
  const branchGeom = conflict.branchVersion?.geometry;

  if (!mainGeom || !branchGeom) return null;

  const mainCount = countCoordinates(mainGeom);
  const branchCount = countCoordinates(branchGeom);

  if (mainCount !== branchCount) {
    const diff = Math.abs(branchCount - mainCount);
    return branchCount > mainCount
      ? `${diff} coordinate point(s) added (${mainCount} → ${branchCount})`
      : `${diff} coordinate point(s) removed (${mainCount} → ${branchCount})`;
  }

  return `${mainCount} coordinate points (positions modified)`;
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
    // Automatically load branch comparison after loading is complete
    if (mergeRequest.value) {
      loadBranchComparison();
    }
  }
};

const loadBranchComparison = async () => {
  if (!mergeRequest.value) return;

  loadingComparison.value = true;
  try {
    branchComparison.value = await api.compareBranches(
      mergeRequest.value.sourceBranchId,
      mergeRequest.value.targetBranchId
    );
  } catch (error) {
    console.error("Failed to load branch comparison:", error);
  } finally {
    loadingComparison.value = false;
  }
};

onMounted(() => {
  loadMergeRequest();
});
</script>

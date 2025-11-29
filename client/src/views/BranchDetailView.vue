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
              @click="handleExportGeoJson"
              :disabled="exporting"
              class="px-4 py-2 border border-primary-600 rounded-md text-primary-600 hover:bg-primary-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              <svg
                class="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              <span>{{ exporting ? 'Exporting...' : 'Export GeoJSON' }}</span>
            </button>
            <button
              @click="handleExportShapefile"
              :disabled="exporting"
              class="px-4 py-2 border border-purple-600 rounded-md text-purple-600 hover:bg-purple-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              <svg
                class="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              <span>{{ exporting ? 'Exporting...' : 'Export Shapefile' }}</span>
            </button>
            <button
              v-if="canEdit"
              @click="
                router.push(
                  `/datasets/${datasetId}/branches/${branchId}/commit`
                )
              "
              :disabled="hasUnresolvedConflicts"
              :class="[
                'px-4 py-2 rounded-md',
                hasUnresolvedConflicts
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-primary-600 text-white hover:bg-primary-700',
              ]"
              :title="
                hasUnresolvedConflicts
                  ? 'Cannot create commit. Please resolve conflicts with main branch first.'
                  : ''
              "
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

      <!-- Unresolved Conflicts Warning -->
      <div
        v-if="hasUnresolvedConflicts"
        class="bg-orange-50 border border-orange-300 rounded-lg p-4 mb-6"
      >
        <div class="flex items-start">
          <svg
            class="h-6 w-6 text-orange-600 mt-0.5"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fill-rule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clip-rule="evenodd"
            />
          </svg>
          <div class="ml-3">
            <h3 class="text-lg font-medium text-orange-900">
              Unresolved Conflicts Detected
            </h3>
            <p class="text-orange-700 mt-1">
              This branch has unresolved conflicts with the main branch. You must
              resolve these conflicts before creating new commits. Use the "Fetch Main"
              button to view and resolve conflicts.
            </p>
          </div>
        </div>
      </div>

      <!-- Map -->
      <div class="bg-white rounded-lg shadow mb-6">
        <div class="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h2 class="text-xl font-semibold text-gray-900">Spatial Features</h2>
          <span v-if="features.length > 100" class="text-sm px-3 py-1 bg-green-100 text-green-800 rounded-full">
            🚀 Using Vector Tiles
          </span>
        </div>
        <div class="p-4">
          <!-- MapViewer auto-detects: MVT for branchId, GeoJSON for features array -->
          <MapViewer
            v-if="features.length > 100"
            :branchId="branchId"
            color="#3b82f6"
            :height="500"
          />
          <MapViewer v-else :features="features" :height="500" />
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

    <div
      v-if="showCommitChangesModal && selectedCommitChanges"
      class="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-[1000]"
    >
      <div
        class="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col"
      >
        <CommitChanges
          :commit="selectedCommitChanges.commit"
          :changes="selectedCommitChanges.changes"
        />
        <div class="p-4 border-t flex justify-end bg-white flex-shrink-0">
          <button
            @click="showCommitChangesModal = false"
            class="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="showConflictsModal"
      class="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-[1000] p-4"
    >
      <div
        class="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col"
      >
        <div
          class="text-white px-6 py-4"
          :class="hasUnresolvedConflicts ? 'bg-red-600' : 'bg-green-600'"
        >
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-2xl font-bold">
                {{ hasUnresolvedConflicts ? 'Resolve Conflicts with Main' : 'Conflict Review' }}
              </h2>
              <p class="text-sm mt-1" :class="hasUnresolvedConflicts ? 'text-red-100' : 'text-green-100'">
                <template v-if="hasUnresolvedConflicts">
                  {{ conflicts?.conflicts.length || 0 }} conflict(s) detected -
                  {{ conflictResolutions.length }} resolved
                </template>
                <template v-else>
                  Conflicts have been resolved. You can review the differences below.
                </template>
              </p>
            </div>
            <button
              @click="showConflictsModal = false"
              class="text-white rounded-full p-2 transition"
              :class="hasUnresolvedConflicts ? 'hover:bg-red-700' : 'hover:bg-green-700'"
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
                !hasUnresolvedConflicts
                  ? 'border-green-300 bg-green-50'
                  : getConflictResolution(conflict.featureId)
                    ? 'border-green-300 bg-green-50'
                    : 'border-red-300 bg-white'
              "
            >
              <div
                class="px-4 py-3 flex items-center justify-between"
                :class="
                  hasUnresolvedConflicts
                    ? getConflictResolution(conflict.featureId)
                      ? 'bg-green-100'
                      : 'bg-red-100'
                    : 'bg-green-50'
                "
              >
                <div class="flex items-center space-x-3">
                  <div
                    class="w-8 h-8 rounded-full flex items-center justify-center"
                    :class="
                      hasUnresolvedConflicts
                        ? getConflictResolution(conflict.featureId)
                          ? 'bg-green-600 text-white'
                          : 'bg-red-600 text-white'
                        : 'bg-green-600 text-white'
                    "
                  >
                    <svg
                      v-if="!hasUnresolvedConflicts || getConflictResolution(conflict.featureId)"
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
                  v-if="hasUnresolvedConflicts && getConflictResolution(conflict.featureId)"
                  class="px-3 py-1 bg-green-600 text-white text-sm rounded-full font-medium"
                >
                  {{
                    getConflictResolution(conflict.featureId) === "use_main"
                      ? "Using Main"
                      : "Using Branch"
                  }}
                </div>
                <div
                  v-else-if="!hasUnresolvedConflicts"
                  class="px-3 py-1 bg-green-600 text-white text-sm rounded-full font-medium"
                >
                  Resolved
                </div>
              </div>

              <div class="p-4">
                <ConflictDiffView
                  :mainVersion="conflict.mainVersion"
                  :branchVersion="conflict.branchVersion"
                  mainLabel="main"
                  :branchLabel="branch?.name || 'branch'"
                />

                <div v-if="hasUnresolvedConflicts" class="mt-4">
                  <p class="text-sm font-medium text-gray-700 mb-2">Choose Resolution Strategy:</p>
                  <div class="grid grid-cols-2 gap-2 mb-2">
                    <!-- Use Main -->
                    <button
                      @click="resolveConflict(conflict.featureId, 'use_main')"
                      class="py-2.5 px-3 rounded-lg font-medium text-sm transition"
                      :class="
                        getConflictResolution(conflict.featureId) === 'use_main'
                          ? 'bg-blue-600 text-white shadow-lg ring-2 ring-blue-300'
                          : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                      "
                    >
                      <div class="flex items-center justify-center">
                        <svg v-if="getConflictResolution(conflict.featureId) === 'use_main'" class="w-4 h-4 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                        </svg>
                        Main Version
                      </div>
                    </button>

                    <!-- Use Branch -->
                    <button
                      @click="resolveConflict(conflict.featureId, 'use_branch')"
                      class="py-2.5 px-3 rounded-lg font-medium text-sm transition"
                      :class="
                        getConflictResolution(conflict.featureId) === 'use_branch'
                          ? 'bg-green-600 text-white shadow-lg ring-2 ring-green-300'
                          : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'
                      "
                    >
                      <div class="flex items-center justify-center">
                        <svg v-if="getConflictResolution(conflict.featureId) === 'use_branch'" class="w-4 h-4 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                        </svg>
                        My Version
                      </div>
                    </button>

                    <button
                      @click="resolveConflict(conflict.featureId, 'use_ancestor')"
                      :disabled="!conflict.ancestorVersion"
                      class="py-2.5 px-3 rounded-lg font-medium text-sm transition"
                      :class="
                        getConflictResolution(conflict.featureId) === 'use_ancestor'
                          ? 'bg-purple-600 text-white shadow-lg ring-2 ring-purple-300'
                          : conflict.ancestorVersion
                            ? 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                      "
                      :title="conflict.ancestorVersion ? 'Revert to original (before changes)' : 'No ancestor version available'"
                    >
                      <div class="flex items-center justify-center">
                        <svg v-if="getConflictResolution(conflict.featureId) === 'use_ancestor'" class="w-4 h-4 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                        </svg>
                        Original
                      </div>
                    </button>

                    <!-- Delete -->
                    <button
                      @click="resolveConflict(conflict.featureId, 'delete')"
                      class="py-2.5 px-3 rounded-lg font-medium text-sm transition"
                      :class="
                        getConflictResolution(conflict.featureId) === 'delete'
                          ? 'bg-red-600 text-white shadow-lg ring-2 ring-red-300'
                          : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
                      "
                      title="Remove this feature"
                    >
                      <div class="flex items-center justify-center">
                        <svg v-if="getConflictResolution(conflict.featureId) === 'delete'" class="w-4 h-4 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                        </svg>
                        Delete Feature
                      </div>
                    </button>
                  </div>

                  <button
                    @click="resolveConflict(conflict.featureId, 'custom')"
                    class="w-full py-2.5 px-3 rounded-lg font-medium text-sm transition"
                    :class="
                      getConflictResolution(conflict.featureId) === 'custom'
                        ? 'bg-orange-600 text-white shadow-lg ring-2 ring-orange-300'
                        : 'bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200'
                    "
                    title="Manually edit geometry and properties"
                  >
                    <div class="flex items-center justify-center">
                      <svg v-if="getConflictResolution(conflict.featureId) === 'custom'" class="w-4 h-4 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                      </svg>
                      <svg v-else class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Custom Edit (Advanced)
                    </div>
                  </button>
                  <p class="text-xs text-gray-500 mt-1 text-center" v-if="getConflictResolution(conflict.featureId) === 'custom'">
                    Note: Custom resolution requires manual geometry editing (coming soon)
                  </p>
                </div>

                <!-- Already Resolved Badge -->
                <div v-else class="mt-4 bg-green-100 border border-green-300 rounded-lg p-3 text-center">
                  <p class="text-green-800 font-medium text-sm">
                    ✓ This conflict has been resolved
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="text-center py-8">
            <svg
              class="w-16 h-16 mx-auto text-green-500 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p class="text-green-600 text-lg font-medium">
              {{ hasUnresolvedConflicts ? 'No conflicts found. Branch is up to date with main.' : 'All conflicts have been resolved! You can now create commits.' }}
            </p>
            <p v-if="!hasUnresolvedConflicts && conflicts?.conflicts.length" class="text-gray-600 text-sm mt-2">
              The differences shown above have been reviewed and resolved.
            </p>
          </div>
        </div>

        <div class="border-t bg-gray-50 px-6 py-4 flex justify-between items-center">
          <div class="text-sm text-gray-600">
            <template v-if="hasUnresolvedConflicts">
              <span v-if="conflictResolutions.length > 0">
                {{ conflictResolutions.length }} of
                {{ conflicts?.conflicts.length || 0 }} conflicts resolved
              </span>
              <span v-else class="text-red-600 font-medium">
                Please resolve all conflicts before saving
              </span>
            </template>
            <template v-else>
              <span class="text-green-600 font-medium">
                ✓ All conflicts have been resolved
              </span>
            </template>
          </div>
          <div class="flex space-x-3">
            <button
              @click="showConflictsModal = false"
              class="px-5 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 font-medium transition"
            >
              {{ hasUnresolvedConflicts ? 'Cancel' : 'Close' }}
            </button>
            <button
              v-if="hasUnresolvedConflicts && conflictResolutions.length === conflicts?.conflicts.length && conflicts?.hasConflicts"
              @click="handleResolveBranchConflicts"
              :disabled="resolvingConflicts"
              class="px-5 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 font-medium transition shadow-lg"
            >
              {{
                resolvingConflicts
                  ? "Saving..."
                  : `Save ${conflictResolutions.length} Resolution(s)`
              }}
            </button>
          </div>
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
import CommitChanges from "@/components/CommitChanges.vue";
import ConflictDiffView from "@/components/ConflictDiffView.vue";
import api from "@/services/api";
import type { CommitChanges as CommitChangesType } from "@/types";

const route = useRoute();
const router = useRouter();
const spatialStore = useSpatialStore();
const mergeRequestStore = useMergeRequestStore();

const datasetId = route.params.datasetId as string;
const branchId = route.params.branchId as string;
const loading = ref(false);
const exporting = ref(false);
const showConflictsModal = ref(false);
const showCommitChangesModal = ref(false);
const selectedCommitChanges = ref<CommitChangesType | null>(null);
const conflictResolutions = ref<
  Array<{
    featureId: string;
    resolution: "use_main" | "use_branch" | "use_ancestor" | "delete" | "custom";
    customGeometry?: any;
    customProperties?: any;
  }>
>([]);
const resolvingConflicts = ref(false);

const branch = computed(() => spatialStore.currentBranch);
const commits = computed(() => spatialStore.commits);
const features = computed(() => spatialStore.features);
const conflicts = computed(() => spatialStore.conflicts);
const canEdit = computed(() => spatialStore.branchCanEdit);
const hasOpenMergeRequest = computed(
  () => spatialStore.branchHasOpenMergeRequest
);
const hasUnresolvedConflicts = computed(
  () => spatialStore.branchHasUnresolvedConflicts
);

const formatDate = (date: string) => {
  return format(new Date(date), "MMM dd, yyyy HH:mm");
};

const handleExportGeoJson = async () => {
  exporting.value = true;
  try {
    const blob = await api.exportGeoJson(branchId);

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;

    const branchName = branch.value?.name || 'branch';
    const timestamp = new Date().toISOString().split('T')[0];
    link.download = `${branchName}_${timestamp}.geojson`;

    document.body.appendChild(link);
    link.click();

    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Failed to export GeoJSON:", error);
    alert("Failed to export GeoJSON. Please try again.");
  } finally {
    exporting.value = false;
  }
};

const handleExportShapefile = async () => {
  exporting.value = true;
  try {
    const blob = await api.exportShapefile(branchId);

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;

    const branchName = branch.value?.name || 'branch';
    const timestamp = new Date().toISOString().split('T')[0];
    link.download = `${branchName}_${timestamp}.zip`;

    document.body.appendChild(link);
    link.click();

    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Failed to export Shapefile:", error);
    alert("Failed to export Shapefile. Please try again.");
  } finally {
    exporting.value = false;
  }
};

const handleFetchMain = async () => {
  try {
    conflictResolutions.value = [];
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

const getConflictResolution = (featureId: string) => {
  const resolution = conflictResolutions.value.find(
    (r) => r.featureId === featureId
  );
  return resolution?.resolution;
};

const resolveConflict = (
  featureId: string,
  resolution: "use_main" | "use_branch" | "use_ancestor" | "delete" | "custom",
  customData?: { geometry?: any; properties?: any }
) => {
  const existingIndex = conflictResolutions.value.findIndex(
    (r) => r.featureId === featureId
  );
  if (existingIndex >= 0) {
    conflictResolutions.value[existingIndex].resolution = resolution;
    conflictResolutions.value[existingIndex].customGeometry = customData?.geometry;
    conflictResolutions.value[existingIndex].customProperties = customData?.properties;
  } else {
    conflictResolutions.value.push({
      featureId,
      resolution,
      customGeometry: customData?.geometry,
      customProperties: customData?.properties,
    });
  }
};

const formatConflictType = (type: string) => {
  const types: Record<string, string> = {
    both_modified: "Both branches modified this feature",
    modified: "Feature was modified",
    deleted: "Feature was deleted",
  };
  return types[type] || type;
};

const handleResolveBranchConflicts = async () => {
  if (!conflicts.value?.hasConflicts) return;

  if (
    conflictResolutions.value.length !== conflicts.value.conflicts.length
  ) {
    alert("Please resolve all conflicts before saving");
    return;
  }

  try {
    resolvingConflicts.value = true;
    await api.resolveBranchConflicts(branchId, conflictResolutions.value);

    alert("Conflicts resolved successfully!");
    showConflictsModal.value = false;
    conflictResolutions.value = [];

    await spatialStore.fetchBranchWithPermissions(branchId);
    await spatialStore.fetchLatestFeatures(branchId);
  } catch (error: any) {
    console.error("Failed to resolve conflicts:", error);
    alert(error.response?.data?.message || "Failed to resolve conflicts");
  } finally {
    resolvingConflicts.value = false;
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

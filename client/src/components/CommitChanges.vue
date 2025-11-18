<template>
  <div class="bg-white rounded-lg shadow">
    <div class="px-6 py-4 border-b border-gray-200">
      <h3 class="text-lg font-semibold text-gray-900">Commit Changes</h3>
      <p class="text-sm text-gray-600">{{ commit.message }}</p>
      <p class="text-xs text-gray-500 mt-1">
        by {{ commit.author?.username || "Unknown" }} on
        {{ formatDate(commit.createdAt) }}
      </p>
    </div>

    <div class="p-4">
      <!-- Summary -->
      <div class="grid grid-cols-3 gap-4 mb-4">
        <div class="bg-green-50 p-3 rounded-lg text-center">
          <div class="text-2xl font-bold text-green-600">
            {{ changes.created.length }}
          </div>
          <div class="text-sm text-green-700">Added</div>
        </div>
        <div class="bg-blue-50 p-3 rounded-lg text-center">
          <div class="text-2xl font-bold text-blue-600">
            {{ changes.updated.length }}
          </div>
          <div class="text-sm text-blue-700">Modified</div>
        </div>
        <div class="bg-red-50 p-3 rounded-lg text-center">
          <div class="text-2xl font-bold text-red-600">
            {{ changes.deleted.length }}
          </div>
          <div class="text-sm text-red-700">Deleted</div>
        </div>
      </div>

      <!-- Feature List -->
      <div class="space-y-3 max-h-96 overflow-y-auto">
        <!-- Created Features -->
        <div v-for="feature in changes.created" :key="feature.id">
          <div
            class="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200"
          >
            <div>
              <span
                class="inline-block px-2 py-1 text-xs font-semibold bg-green-600 text-white rounded"
              >
                ADDED
              </span>
              <span class="ml-2 text-sm font-medium">{{
                feature.geometryType
              }}</span>
              <span class="ml-2 text-xs text-gray-500">{{
                feature.featureId
              }}</span>
            </div>
            <button
              @click="$emit('viewFeature', feature)"
              class="text-green-600 hover:text-green-800 text-sm"
            >
              View
            </button>
          </div>
        </div>

        <!-- Updated Features -->
        <div v-for="feature in changes.updated" :key="feature.id">
          <div
            class="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200"
          >
            <div>
              <span
                class="inline-block px-2 py-1 text-xs font-semibold bg-blue-600 text-white rounded"
              >
                MODIFIED
              </span>
              <span class="ml-2 text-sm font-medium">{{
                feature.geometryType
              }}</span>
              <span class="ml-2 text-xs text-gray-500">{{
                feature.featureId
              }}</span>
            </div>
            <button
              @click="$emit('viewFeature', feature)"
              class="text-blue-600 hover:text-blue-800 text-sm"
            >
              View
            </button>
          </div>
        </div>

        <!-- Deleted Features -->
        <div v-for="feature in changes.deleted" :key="feature.id">
          <div
            class="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200"
          >
            <div>
              <span
                class="inline-block px-2 py-1 text-xs font-semibold bg-red-600 text-white rounded"
              >
                DELETED
              </span>
              <span class="ml-2 text-sm font-medium">{{
                feature.geometryType
              }}</span>
              <span class="ml-2 text-xs text-gray-500">{{
                feature.featureId
              }}</span>
            </div>
            <button
              @click="$emit('viewFeature', feature)"
              class="text-red-600 hover:text-red-800 text-sm"
            >
              View
            </button>
          </div>
        </div>

        <div
          v-if="changes.total === 0"
          class="text-center text-gray-500 py-4"
        >
          No changes in this commit
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { format } from "date-fns";
import type { CommitChanges, SpatialFeature } from "@/types";

interface Props {
  commit: CommitChanges["commit"];
  changes: CommitChanges["changes"];
}

defineProps<Props>();

defineEmits<{
  viewFeature: [feature: SpatialFeature];
}>();

const formatDate = (date: string) => {
  return format(new Date(date), "MMM dd, yyyy HH:mm");
};
</script>

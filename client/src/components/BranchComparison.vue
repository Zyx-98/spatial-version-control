<template>
  <div class="bg-white rounded-lg shadow">
    <div class="px-6 py-4 border-b border-gray-200">
      <h3 class="text-lg font-semibold text-gray-900">Branch Comparison</h3>
      <p class="text-sm text-gray-600">
        Changes from source branch compared to target branch
      </p>
    </div>

    <div class="p-4">
      <!-- Summary -->
      <div class="grid grid-cols-4 gap-4 mb-4">
        <div class="bg-green-50 p-3 rounded-lg text-center">
          <div class="text-2xl font-bold text-green-600">
            {{ summary.added }}
          </div>
          <div class="text-sm text-green-700">Added</div>
        </div>
        <div class="bg-orange-50 p-3 rounded-lg text-center">
          <div class="text-2xl font-bold text-orange-600">
            {{ summary.modified }}
          </div>
          <div class="text-sm text-orange-700">Modified</div>
        </div>
        <div class="bg-red-50 p-3 rounded-lg text-center">
          <div class="text-2xl font-bold text-red-600">
            {{ summary.deleted }}
          </div>
          <div class="text-sm text-red-700">Deleted</div>
        </div>
        <div class="bg-gray-50 p-3 rounded-lg text-center">
          <div class="text-2xl font-bold text-gray-600">
            {{ summary.unchanged }}
          </div>
          <div class="text-sm text-gray-700">Unchanged</div>
        </div>
      </div>

      <!-- Feature List -->
      <div class="space-y-3 max-h-96 overflow-y-auto">
        <!-- Added Features -->
        <div v-for="feature in changes.added" :key="feature.id">
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

        <!-- Modified Features -->
        <div v-for="item in changes.modified" :key="item.source.id">
          <div
            class="p-3 bg-orange-50 rounded-lg border border-orange-200 space-y-2"
          >
            <div class="flex items-center justify-between">
              <div>
                <span
                  class="inline-block px-2 py-1 text-xs font-semibold bg-orange-600 text-white rounded"
                >
                  MODIFIED
                </span>
                <span class="ml-2 text-sm font-medium">{{
                  item.source.geometryType
                }}</span>
                <span class="ml-2 text-xs text-gray-500">{{
                  item.source.featureId
                }}</span>
              </div>
              <button
                @click="$emit('compareFeature', item)"
                class="text-orange-600 hover:text-orange-800 text-sm"
              >
                Compare
              </button>
            </div>
            <div class="text-xs text-gray-600">
              Geometry changed between branches
            </div>
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
          v-if="
            changes.added.length === 0 &&
            changes.modified.length === 0 &&
            changes.deleted.length === 0
          "
          class="text-center text-gray-500 py-4"
        >
          No changes between branches
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BranchComparison, SpatialFeature } from "@/types";

interface Props {
  summary: BranchComparison["summary"];
  changes: BranchComparison["changes"];
}

defineProps<Props>();

defineEmits<{
  viewFeature: [feature: SpatialFeature];
  compareFeature: [item: { source: SpatialFeature; target: SpatialFeature }];
}>();
</script>

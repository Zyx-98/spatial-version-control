<template>
  <div class="enhanced-commit-changes flex flex-col flex-1 min-h-0">
    <div class="bg-gray-50 px-6 py-4 border-b flex-shrink-0 sticky top-0 z-10">
      <h3 class="text-lg font-semibold text-gray-900">{{ commit.message }}</h3>
      <p class="text-sm text-gray-600 mt-1">
        by {{ commit.author?.username || "Unknown" }} on
        {{ formatDate(commit.createdAt) }}
      </p>
    </div>

    <div class="p-4 flex-shrink-0">
      <div class="grid grid-cols-3 gap-4 mb-4">
        <div
          class="bg-green-50 p-3 rounded-lg text-center cursor-pointer hover:bg-green-100"
          @click="filterBy = filterBy === 'created' ? 'all' : 'created'"
          :class="{ 'ring-2 ring-green-500': filterBy === 'created' }"
        >
          <div class="text-2xl font-bold text-green-600">
            {{ changes.created.length }}
          </div>
          <div class="text-sm text-green-700">Added</div>
        </div>
        <div
          class="bg-blue-50 p-3 rounded-lg text-center cursor-pointer hover:bg-blue-100"
          @click="filterBy = filterBy === 'updated' ? 'all' : 'updated'"
          :class="{ 'ring-2 ring-blue-500': filterBy === 'updated' }"
        >
          <div class="text-2xl font-bold text-blue-600">
            {{ changes.updated.length }}
          </div>
          <div class="text-sm text-blue-700">Modified</div>
        </div>
        <div
          class="bg-red-50 p-3 rounded-lg text-center cursor-pointer hover:bg-red-100"
          @click="filterBy = filterBy === 'deleted' ? 'all' : 'deleted'"
          :class="{ 'ring-2 ring-red-500': filterBy === 'deleted' }"
        >
          <div class="text-2xl font-bold text-red-600">
            {{ changes.deleted.length }}
          </div>
          <div class="text-sm text-red-700">Deleted</div>
        </div>
      </div>

      <div class="mb-4">
        <h4 class="text-md font-semibold mb-3">Changes Visualization</h4>
        <MapViewer :features="allFeatures" :height="250" />
        <div class="mt-2 flex justify-center space-x-6 text-xs">
          <div class="flex items-center">
            <span class="w-3 h-3 rounded-full bg-green-500 mr-2"></span>
            Added
          </div>
          <div class="flex items-center">
            <span class="w-3 h-3 rounded-full bg-blue-500 mr-2"></span>
            Modified
          </div>
          <div class="flex items-center">
            <span class="w-3 h-3 rounded-full bg-red-500 mr-2"></span>
            Deleted
          </div>
        </div>
      </div>
    </div>

    <div class="px-4 pb-4 flex flex-col min-h-0 flex-1 overflow-hidden">
      <div class="flex justify-between items-center mb-3 flex-shrink-0">
        <h4 class="text-md font-semibold">Feature Details</h4>
        <button
          v-if="filterBy !== 'all'"
          @click="filterBy = 'all'"
          class="text-sm text-primary-600 hover:text-primary-800"
        >
          Show all
        </button>
      </div>

      <div class="space-y-3 overflow-y-auto pr-2 flex-1">
          <div
            v-for="feature in filteredCreatedFeatures"
            :key="'create-' + feature.id"
            class="transition-all"
          >
            <FeatureDiff
              :featureId="feature.featureId"
              :geometryType="feature.geometryType"
              operation="create"
              :newGeometry="feature.geometry"
              :newProperties="feature.properties"
            />
          </div>

          <div
            v-for="feature in filteredUpdatedFeatures"
            :key="'update-' + feature.id"
            class="transition-all"
          >
            <FeatureDiff
              :featureId="feature.featureId"
              :geometryType="feature.geometryType"
              operation="update"
              :newGeometry="feature.geometry"
              :newProperties="feature.properties"
            />
          </div>

          <!-- Deleted Features -->
          <div
            v-for="feature in filteredDeletedFeatures"
            :key="'delete-' + feature.id"
            class="transition-all"
          >
            <FeatureDiff
              :featureId="feature.featureId"
              :geometryType="feature.geometryType"
              operation="delete"
              :oldGeometry="feature.geometry"
              :oldProperties="feature.properties"
            />
          </div>

          <div
            v-if="
              filteredCreatedFeatures.length === 0 &&
              filteredUpdatedFeatures.length === 0 &&
              filteredDeletedFeatures.length === 0
            "
            class="text-center text-gray-500 py-4"
          >
            {{ filterBy === "all" ? "No changes" : `No ${filterBy} features` }}
          </div>
        </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { format } from "date-fns";
import { FeatureOperation, type CommitChanges } from "@/types";
import FeatureDiff from "./FeatureDiff.vue";
import MapViewer from "./MapViewer.vue";

interface Props {
  commit: CommitChanges["commit"];
  changes: CommitChanges["changes"];
}

const props = defineProps<Props>();

const filterBy = ref<"all" | "created" | "updated" | "deleted">("all");

const formatDate = (date: string) => {
  return format(new Date(date), "MMM dd, yyyy HH:mm");
};

const filteredCreatedFeatures = computed(() => {
  if (filterBy.value === "all" || filterBy.value === "created") {
    return props.changes.created;
  }
  return [];
});

const filteredUpdatedFeatures = computed(() => {
  if (filterBy.value === "all" || filterBy.value === "updated") {
    return props.changes.updated;
  }
  return [];
});

const filteredDeletedFeatures = computed(() => {
  if (filterBy.value === "all" || filterBy.value === "deleted") {
    return props.changes.deleted;
  }
  return [];
});

const allFeatures = computed(() => {
  return [
    ...props.changes.created.map((f) => ({ ...f, operation: FeatureOperation.CREATE })),
    ...props.changes.updated.map((f) => ({ ...f, operation: FeatureOperation.UPDATE })),
    ...props.changes.deleted.map((f) => ({ ...f, operation: FeatureOperation.DELETE })),
  ];
});
</script>

<template>
  <div class="enhanced-branch-comparison">
    <!-- Summary Stats -->
    <div class="grid grid-cols-4 gap-4 mb-6">
      <div
        class="bg-green-50 p-4 rounded-lg text-center cursor-pointer hover:bg-green-100"
        @click="filterBy = filterBy === 'added' ? 'all' : 'added'"
        :class="{ 'ring-2 ring-green-500': filterBy === 'added' }"
      >
        <div class="text-3xl font-bold text-green-600">
          {{ summary.added }}
        </div>
        <div class="text-sm text-green-700 font-medium">Added</div>
      </div>
      <div
        class="bg-orange-50 p-4 rounded-lg text-center cursor-pointer hover:bg-orange-100"
        @click="filterBy = filterBy === 'modified' ? 'all' : 'modified'"
        :class="{ 'ring-2 ring-orange-500': filterBy === 'modified' }"
      >
        <div class="text-3xl font-bold text-orange-600">
          {{ summary.modified }}
        </div>
        <div class="text-sm text-orange-700 font-medium">Modified</div>
      </div>
      <div
        class="bg-red-50 p-4 rounded-lg text-center cursor-pointer hover:bg-red-100"
        @click="filterBy = filterBy === 'deleted' ? 'all' : 'deleted'"
        :class="{ 'ring-2 ring-red-500': filterBy === 'deleted' }"
      >
        <div class="text-3xl font-bold text-red-600">
          {{ summary.deleted }}
        </div>
        <div class="text-sm text-red-700 font-medium">Deleted</div>
      </div>
      <div class="bg-gray-50 p-4 rounded-lg text-center">
        <div class="text-3xl font-bold text-gray-600">
          {{ summary.unchanged }}
        </div>
        <div class="text-sm text-gray-700 font-medium">Unchanged</div>
      </div>
    </div>

    <!-- Split Map View -->
    <div class="mb-6">
      <h3 class="text-lg font-semibold mb-3">Visual Comparison</h3>
      <SplitMapView
        :leftFeatures="targetFeatures"
        :rightFeatures="sourceFeatures"
        :leftLabel="targetLabel"
        :rightLabel="sourceLabel"
        :height="450"
        :highlightedFeatureId="highlightedFeatureId"
      />
    </div>

    <!-- Feature Changes List -->
    <div>
      <div class="flex justify-between items-center mb-3">
        <h3 class="text-lg font-semibold">
          Feature Changes
          <span v-if="filterBy !== 'all'" class="text-sm font-normal text-gray-500">
            ({{ filterBy }})
          </span>
        </h3>
        <button
          v-if="filterBy !== 'all'"
          @click="filterBy = 'all'"
          class="text-sm text-primary-600 hover:text-primary-800"
        >
          Show all
        </button>
      </div>

      <div class="space-y-4 max-h-[600px] overflow-y-auto pr-2">
        <!-- Added Features -->
        <div
          v-for="feature in filteredAddedFeatures"
          :key="'add-' + feature.id"
          @mouseenter="highlightedFeatureId = feature.featureId"
          @mouseleave="highlightedFeatureId = null"
          class="transition-all"
          :class="{
            'ring-2 ring-green-400': highlightedFeatureId === feature.featureId,
          }"
        >
          <FeatureDiff
            :featureId="feature.featureId"
            :geometryType="feature.geometryType"
            operation="create"
            :newGeometry="feature.geometry"
            :newProperties="feature.properties"
          />
        </div>

        <!-- Modified Features -->
        <div
          v-for="item in filteredModifiedFeatures"
          :key="'mod-' + item.source.id"
          @mouseenter="highlightedFeatureId = item.source.featureId"
          @mouseleave="highlightedFeatureId = null"
          class="transition-all"
          :class="{
            'ring-2 ring-orange-400':
              highlightedFeatureId === item.source.featureId,
          }"
        >
          <FeatureDiff
            :featureId="item.source.featureId"
            :geometryType="item.source.geometryType"
            operation="update"
            :oldGeometry="item.target.geometry"
            :newGeometry="item.source.geometry"
            :oldProperties="item.target.properties"
            :newProperties="item.source.properties"
          />
        </div>

        <!-- Deleted Features -->
        <div
          v-for="feature in filteredDeletedFeatures"
          :key="'del-' + feature.id"
          @mouseenter="highlightedFeatureId = feature.featureId"
          @mouseleave="highlightedFeatureId = null"
          class="transition-all"
          :class="{
            'ring-2 ring-red-400': highlightedFeatureId === feature.featureId,
          }"
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
            filteredAddedFeatures.length === 0 &&
            filteredModifiedFeatures.length === 0 &&
            filteredDeletedFeatures.length === 0
          "
          class="text-center text-gray-500 py-8"
        >
          {{ filterBy === "all" ? "No changes" : `No ${filterBy} features` }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import type { BranchComparison, SpatialFeature } from "@/types";
import SplitMapView from "./SplitMapView.vue";
import FeatureDiff from "./FeatureDiff.vue";

interface Props {
  summary: BranchComparison["summary"];
  changes: BranchComparison["changes"];
  sourceLabel?: string;
  targetLabel?: string;
}

const props = withDefaults(defineProps<Props>(), {
  sourceLabel: "Source Branch",
  targetLabel: "Target Branch",
});

const filterBy = ref<"all" | "added" | "modified" | "deleted">("all");
const highlightedFeatureId = ref<string | null>(null);

// Features for maps
const sourceFeatures = computed(() => {
  const features: SpatialFeature[] = [];

  // Add new features
  features.push(...props.changes.added);

  // Add modified features (source version)
  props.changes.modified.forEach((item) => {
    features.push(item.source);
  });

  // Add unchanged features
  features.push(...props.changes.unchanged);

  return features;
});

const targetFeatures = computed(() => {
  const features: SpatialFeature[] = [];

  // Add deleted features
  features.push(...props.changes.deleted);

  // Add modified features (target version)
  props.changes.modified.forEach((item) => {
    features.push(item.target);
  });

  // Add unchanged features
  features.push(...props.changes.unchanged);

  return features;
});

// Filtered features
const filteredAddedFeatures = computed(() => {
  if (filterBy.value === "all" || filterBy.value === "added") {
    return props.changes.added;
  }
  return [];
});

const filteredModifiedFeatures = computed(() => {
  if (filterBy.value === "all" || filterBy.value === "modified") {
    return props.changes.modified;
  }
  return [];
});

const filteredDeletedFeatures = computed(() => {
  if (filterBy.value === "all" || filterBy.value === "deleted") {
    return props.changes.deleted;
  }
  return [];
});
</script>

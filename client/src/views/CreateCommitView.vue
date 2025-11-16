<template>
  <div class="max-w-7xl mx-auto">
    <div class="mb-6">
      <h1 class="text-3xl font-bold text-gray-900">Create Commit</h1>
      <p class="text-gray-600 mt-2">Add spatial features and commit changes</p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Left Panel - Form -->
      <div class="lg:col-span-1 space-y-6">
        <!-- Commit Message -->
        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-lg font-semibold mb-4">Commit Details</h2>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1"
              >Commit Message</label
            >
            <textarea
              v-model="commitMessage"
              rows="3"
              required
              placeholder="Describe your changes..."
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            ></textarea>
          </div>
        </div>

        <!-- Add Feature -->
        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-lg font-semibold mb-4">Add Feature</h2>
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1"
                >Geometry Type</label
              >
              <select
                v-model="newFeature.geometryType"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="Point">Point</option>
                <option value="LineString">LineString</option>
                <option value="Polygon">Polygon</option>
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1"
                >Operation</label
              >
              <select
                v-model="newFeature.operation"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="create">Create</option>
                <option value="update">Update</option>
                <option value="delete">Delete</option>
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Properties (JSON)
              </label>
              <textarea
                v-model="propertiesJson"
                rows="4"
                placeholder='{"name": "Feature Name", "type": "residential"}'
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 font-mono text-sm"
              ></textarea>
            </div>

            <button
              @click="addFeatureManually"
              class="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
            >
              Add Feature
            </button>
          </div>
        </div>

        <!-- Features List -->
        <div class="bg-white rounded-lg shadow p-6">
          <h2 class="text-lg font-semibold mb-4">
            Features ({{ features.length }})
          </h2>
          <div class="space-y-2 max-h-96 overflow-y-auto">
            <div
              v-for="(feature, index) in features"
              :key="index"
              class="flex justify-between items-center p-3 bg-gray-50 rounded-lg"
            >
              <div>
                <p class="font-medium text-sm">{{ feature.geometryType }}</p>
                <p class="text-xs text-gray-500">{{ feature.operation }}</p>
              </div>
              <button
                @click="removeFeature(index)"
                class="text-red-600 hover:text-red-700"
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
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div
              v-if="features.length === 0"
              class="text-center text-gray-500 py-4"
            >
              No features added yet
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex space-x-3">
          <button
            @click="router.back()"
            class="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            @click="handleCommit"
            :disabled="!canCommit || spatialStore.loading"
            class="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{ spatialStore.loading ? "Committing..." : "Commit" }}
          </button>
        </div>
      </div>

      <!-- Right Panel - Map -->
      <div class="lg:col-span-2">
        <div class="bg-white rounded-lg shadow p-6 sticky top-6">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-lg font-semibold">Draw Features</h2>
            <div class="flex space-x-2">
              <button
                v-for="tool in tools"
                :key="tool.type"
                @click="currentTool = tool.type"
                :class="[
                  'px-3 py-1 text-sm rounded-md',
                  currentTool === tool.type
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
                ]"
              >
                {{ tool.label }}
              </button>
            </div>
          </div>
          <MapEditor
            :height="600"
            :tool="currentTool"
            @featureCreated="handleFeatureCreated"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useSpatialStore } from "@/stores/spatial";
import MapEditor from "@/components/MapEditor.vue";
import {
  SpatialFeatureRequest,
  SpatialFeatureType,
  FeatureOperation,
} from "@/types";

const route = useRoute();
const router = useRouter();
const spatialStore = useSpatialStore();

const branchId = route.params.branchId as string;
const datasetId = route.params.datasetId as string;

const commitMessage = ref("");
const features = ref<SpatialFeatureRequest[]>([]);
const propertiesJson = ref("{}");
const currentTool = ref<"point" | "line" | "polygon">("point");

const tools = [
  { type: "point" as const, label: "Point" },
  { type: "line" as const, label: "Line" },
  { type: "polygon" as const, label: "Polygon" },
];

const newFeature = reactive({
  geometryType: "Point" as SpatialFeatureType,
  operation: "create" as FeatureOperation,
});

const canCommit = computed(() => {
  return commitMessage.value.trim() !== "" && features.value.length > 0;
});

const handleFeatureCreated = (geometry: any) => {
  try {
    const properties = JSON.parse(propertiesJson.value || "{}");
    features.value.push({
      geometryType: geometry.type as SpatialFeatureType,
      geometry,
      properties,
      operation: FeatureOperation.CREATE,
    });
  } catch (error) {
    alert("Invalid properties JSON");
  }
};

const addFeatureManually = () => {
  alert("Use the map to draw features. Manual coordinate entry coming soon!");
};

const removeFeature = (index: number) => {
  features.value.splice(index, 1);
};

const handleCommit = async () => {
  if (!canCommit.value) return;

  try {
    await spatialStore.createCommit({
      message: commitMessage.value,
      branchId,
      features: features.value,
    });

    alert("Commit created successfully!");
    router.push(`/datasets/${datasetId}/branches/${branchId}`);
  } catch (error: any) {
    alert(error.response?.data?.message || "Failed to create commit");
  }
};
</script>

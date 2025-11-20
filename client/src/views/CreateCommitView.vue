<template>
  <div class="max-w-7xl mx-auto">
    <div v-if="loadingFeatures" class="text-center py-12">
      <div
        class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"
      ></div>
      <p class="mt-4 text-gray-600">Loading current features...</p>
    </div>

    <div v-else>
      <div class="mb-6">
        <h1 class="text-3xl font-bold text-gray-900">Create Commit</h1>
        <p class="text-gray-600 mt-2">
          Edit existing features, add new ones, or remove features
        </p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-1 space-y-6">
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

          <!-- Import GeoJSON -->
          <div class="bg-white rounded-lg shadow p-6">
            <h2 class="text-lg font-semibold mb-4">Import GeoJSON</h2>
            <div class="space-y-3">
              <p class="text-sm text-gray-600">
                Load features from a GeoJSON file to the map. You can review and edit them before committing.
              </p>
              <div>
                <input
                  type="file"
                  ref="fileInputRef"
                  accept=".geojson,.json"
                  @change="handleFileSelect"
                  class="hidden"
                />
                <button
                  @click="openFileDialog"
                  class="w-full px-4 py-2 border-2 border-dashed border-gray-300 rounded-md text-gray-700 hover:border-primary-500 hover:text-primary-600 transition-colors"
                >
                  <svg
                    class="h-6 w-6 mx-auto mb-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                  Choose GeoJSON File
                </button>
              </div>
              <div
                v-if="selectedFileName"
                class="flex items-center justify-between p-3 bg-gray-50 rounded-md"
              >
                <div class="flex items-center space-x-2">
                  <svg
                    class="h-5 w-5 text-green-600"
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
                  <span class="text-sm font-medium text-gray-700">{{
                    selectedFileName
                  }}</span>
                </div>
                <button
                  @click="clearSelectedFile"
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
              <button
                v-if="selectedFile"
                @click="loadGeoJsonFeatures"
                :disabled="importing"
                class="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {{ importing ? "Loading..." : "Load Features to Map" }}
              </button>
              <div
                v-if="importError"
                class="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800"
              >
                {{ importError }}
              </div>
              <div
                v-if="importSuccess"
                class="p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-800"
              >
                {{ importSuccess }}
              </div>
            </div>
          </div>

          <div
            v-if="selectedFeature && currentTool !== 'edit'"
            class="bg-white rounded-lg shadow p-6"
          >
            <h2 class="text-lg font-semibold mb-4">Edit Feature Properties</h2>
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1"
                  >Feature Type</label
                >
                <p class="text-sm text-gray-600">
                  {{ selectedFeature.geometryType }}
                </p>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  Properties (JSON)
                </label>
                <textarea
                  v-model="selectedFeatureProperties"
                  rows="6"
                  placeholder='{"name": "Feature Name", "type": "residential"}'
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 font-mono text-sm"
                  :class="{ 'border-red-500': propertiesError }"
                ></textarea>
                <p v-if="propertiesError" class="mt-1 text-xs text-red-600">
                  {{ propertiesError }}
                </p>
              </div>
              <div class="flex space-x-2">
                <button
                  @click="saveFeatureProperties"
                  class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Save Changes
                </button>
                <button
                  @click="cancelPropertyEdit"
                  class="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>

          <div
            v-if="!selectedFeature && currentTool !== 'edit'"
            class="bg-white rounded-lg shadow p-6"
          >
            <h2 class="text-lg font-semibold mb-4">New Feature Properties</h2>
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  Properties (JSON) - Optional
                </label>
                <textarea
                  v-model="newFeatureProperties"
                  rows="4"
                  placeholder='{"name": "Feature Name", "type": "residential"}'
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 font-mono text-sm"
                  :class="{ 'border-red-500': newPropertiesError }"
                ></textarea>
                <p v-if="newPropertiesError" class="mt-1 text-xs text-red-600">
                  {{ newPropertiesError }}
                </p>
                <p class="mt-1 text-xs text-gray-500">
                  These properties will be applied to the next feature you draw
                </p>
              </div>
            </div>
          </div>

          <div class="bg-white rounded-lg shadow p-6">
            <h2 class="text-lg font-semibold mb-4">Changes Summary</h2>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between items-center">
                <span class="text-gray-600">Added:</span>
                <span class="font-semibold text-green-600">
                  {{ addedCount }}
                </span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-gray-600">Modified:</span>
                <span class="font-semibold text-orange-600">
                  {{ modifiedCount }}
                </span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-gray-600">Deleted:</span>
                <span class="font-semibold text-red-600">
                  {{ deletedCount }}
                </span>
              </div>
              <div class="border-t pt-2 mt-2 flex justify-between items-center">
                <span class="text-gray-900 font-medium">Total Changes:</span>
                <span class="font-bold text-gray-900">
                  {{ totalChanges }}
                </span>
              </div>
            </div>
          </div>

          <div class="bg-white rounded-lg shadow p-6">
            <h2 class="text-lg font-semibold mb-4">
              Current Features ({{ allFeatures.length }})
            </h2>
            <div class="space-y-2 max-h-96 overflow-y-auto">
              <div
                v-for="(feature, index) in allFeatures"
                :key="feature.id"
                class="flex justify-between items-center p-3 rounded-lg transition-colors cursor-pointer"
                :class="getFeatureCardClass(feature)"
                @click="selectFeatureForEdit(feature, index)"
              >
                <div class="flex-1">
                  <div class="flex items-center space-x-2">
                    <p class="font-medium text-sm">
                      {{ feature.geometryType }}
                    </p>
                    <span
                      class="px-2 py-0.5 text-xs rounded-full"
                      :class="getOperationBadgeClass(feature.operation)"
                    >
                      {{ getOperationLabel(feature.operation) }}
                    </span>
                  </div>
                  <p
                    v-if="
                      feature.properties &&
                      Object.keys(feature.properties).length > 0
                    "
                    class="text-xs text-gray-500 mt-1 truncate"
                  >
                    {{ Object.keys(feature.properties).join(", ") }}
                  </p>
                  <p
                    v-if="feature.featureId"
                    class="text-xs text-gray-400 mt-1"
                  >
                    ID: {{ feature.featureId.substring(0, 8) }}...
                  </p>
                </div>
                <button
                  v-if="feature.operation !== 'delete'"
                  @click.stop="markFeatureAsDeleted(feature)"
                  class="ml-2 text-red-600 hover:text-red-700 p-1"
                  title="Mark for deletion"
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
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
                <button
                  v-else
                  @click.stop="restoreFeature(feature)"
                  class="ml-2 text-green-600 hover:text-green-700 p-1"
                  title="Restore feature"
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
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                </button>
              </div>
              <div
                v-if="allFeatures.length === 0"
                class="text-center text-gray-500 py-4"
              >
                No features yet. Draw on the map to add features.
              </div>
            </div>
          </div>

          <div class="flex space-x-3">
            <button
              @click="handleCancel"
              class="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              @click="handleCommit"
              :disabled="!canCommit || spatialStore.loading"
              class="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {{ spatialStore.loading ? "Committing..." : "Commit Changes" }}
            </button>
          </div>
        </div>

        <div class="lg:col-span-2">
          <div class="bg-white rounded-lg shadow p-6 sticky top-6">
            <div class="flex justify-between items-center mb-4">
              <h2 class="text-lg font-semibold">Map Editor</h2>
              <div class="flex space-x-2">
                <button
                  v-for="tool in tools"
                  :key="tool.type"
                  @click="setTool(tool.type)"
                  :disabled="currentTool === 'edit'"
                  :class="[
                    'px-3 py-2 text-sm rounded-md flex items-center space-x-2',
                    currentTool === tool.type
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
                    currentTool === 'edit' && tool.type !== 'edit'
                      ? 'opacity-50 cursor-not-allowed'
                      : '',
                  ]"
                  :title="tool.description"
                >
                  <span>{{ tool.icon }}</span>
                  <span>{{ tool.label }}</span>
                </button>
              </div>
            </div>
            <MapEditor
              ref="mapEditorRef"
              :height="600"
              :tool="currentTool"
              :features="allFeatures"
              @featureCreated="handleFeatureCreated"
              @featureDeleted="handleFeatureDeleted"
              @featureSelected="handleFeatureSelected"
              @geometryUpdated="handleGeometryUpdated"
              @toolChange="handleToolChange"
            />
            <div class="mt-4 p-4 bg-blue-50 rounded-md">
              <p class="text-sm font-semibold text-blue-900 mb-2">
                💡 Instructions:
              </p>
              <ul class="text-xs text-blue-800 space-y-1.5">
                <li>
                  <strong>Add:</strong> Select Point/Line/Polygon and draw on
                  map
                </li>
                <li>
                  <strong>Edit Properties:</strong> Select feature → Edit in
                  left panel
                </li>
                <li>
                  <strong>Edit Geometry:</strong> Select feature → Click "Edit
                  Geometry" → Drag markers
                </li>
                <li>
                  <strong>Delete:</strong> Click trash icon in feature list
                </li>
                <li><strong>Keyboard:</strong> Delete key, Escape to cancel</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useSpatialStore } from "@/stores/spatial";
import MapEditor from "@/components/MapEditor.vue";
import {
  SpatialFeatureRequest,
  SpatialFeatureType,
  FeatureOperation,
} from "@/types";
import { v4 as uuidv4 } from "uuid";

const route = useRoute();
const router = useRouter();
const spatialStore = useSpatialStore();

const branchId = route.params.branchId as string;
const datasetId = route.params.datasetId as string;

// State
const loadingFeatures = ref(true);
const commitMessage = ref("");
const currentTool = ref<"point" | "line" | "polygon" | "select" | "edit">(
  "select"
);
const mapEditorRef = ref<InstanceType<typeof MapEditor> | null>(null);

const fileInputRef = ref<HTMLInputElement | null>(null);
const openFileDialog = () => {
  fileInputRef.value?.click();
};

// Features state
const originalFeatures = ref<any[]>([]);
const currentFeatures = ref<any[]>([]);
const newFeatures = ref<any[]>([]);
const deletedFeatureIds = ref<Set<string>>(new Set());
const modifiedFeatureIds = ref<Set<string>>(new Set());

// Properties editing
const selectedFeature = ref<any | null>(null);
const selectedFeatureIndex = ref<number | null>(null);
const selectedFeatureProperties = ref("{}");
const propertiesError = ref("");
const newFeatureProperties = ref("{}");
const newPropertiesError = ref("");

// GeoJSON import
const selectedFile = ref<File | null>(null);
const selectedFileName = ref("");
const importing = ref(false);
const importError = ref("");
const importSuccess = ref("");

const tools = [
  {
    type: "select",
    label: "Select",
    icon: "🔍",
    description: "Select and edit features",
  },
  { type: "point", label: "Point", icon: "📍", description: "Draw points" },
  { type: "line", label: "Line", icon: "📏", description: "Draw lines" },
  {
    type: "polygon",
    label: "Polygon",
    icon: "⬡",
    description: "Draw polygons",
  },
];

const deepEqual = (obj1: any, obj2: any): boolean => {
  return JSON.stringify(obj1) === JSON.stringify(obj2);
};

const allFeatures = computed(() => {
  const features = [];

  for (const originalFeature of originalFeatures.value) {
    const featureId = originalFeature.featureId;
    const isDeleted = deletedFeatureIds.value.has(featureId);
    const isModified = modifiedFeatureIds.value.has(featureId);

    let currentFeature = originalFeature;
    if (isModified) {
      const modified = currentFeatures.value.find(
        (f) => f.featureId === featureId
      );
      if (modified) currentFeature = modified;
    }

    features.push({
      ...currentFeature,
      id: featureId,
      operation: isDeleted ? "delete" : isModified ? "update" : "none",
      isOriginal: true,
    });
  }

  for (const feature of newFeatures.value) {
    features.push({
      ...feature,
      id: feature.featureId,
      operation: "create",
      isOriginal: false,
    });
  }

  return features;
});

const addedCount = computed(() => newFeatures.value.length);
const modifiedCount = computed(() => modifiedFeatureIds.value.size);
const deletedCount = computed(() => deletedFeatureIds.value.size);
const totalChanges = computed(
  () => addedCount.value + modifiedCount.value + deletedCount.value
);

const canCommit = computed(() => {
  return commitMessage.value.trim() !== "" && totalChanges.value > 0;
});

watch(selectedFeatureProperties, (newValue) => {
  try {
    JSON.parse(newValue);
    propertiesError.value = "";
  } catch (e) {
    propertiesError.value = "Invalid JSON format";
  }
});

watch(newFeatureProperties, (newValue) => {
  try {
    JSON.parse(newValue);
    newPropertiesError.value = "";
  } catch (e) {
    newPropertiesError.value = "Invalid JSON format";
  }
});

const loadCurrentFeatures = async () => {
  try {
    loadingFeatures.value = true;

    const permissionsResult =
      await spatialStore.fetchBranchWithPermissions(branchId);
    if (!permissionsResult.canEdit) {
      alert("You do not have permission to edit this branch");
      router.push(`/datasets/${datasetId}/branches/${branchId}`);
      return;
    }

    const features = await spatialStore.fetchLatestFeatures(branchId);

    originalFeatures.value = features.map((f) => ({
      ...f,
      featureId: f.featureId || uuidv4(),
      geometryType: f.geometryType,
      geometry: f.geometry,
      properties: f.properties || {},
      operation: f.operation,
    }));

    currentFeatures.value = JSON.parse(JSON.stringify(originalFeatures.value));
  } catch (error) {
    console.error("Failed to load features:", error);
    alert("Failed to load current features");
  } finally {
    loadingFeatures.value = false;
  }
};

const setTool = (tool: string) => {
  if (currentTool.value === "edit") return;
  currentTool.value = tool as any;
};

const handleToolChange = (tool: string) => {
  currentTool.value = tool as any;
};

const convertGeometryTypeForAPI = (geoJSONType: string): SpatialFeatureType => {
  if (geoJSONType === "LineString") return SpatialFeatureType.LINE;
  if (geoJSONType === "MultiLineString") return SpatialFeatureType.MULTILINE;
  return geoJSONType as SpatialFeatureType;
};

const handleFeatureCreated = (geometry: any) => {
  try {
    const properties = newFeatureProperties.value.trim()
      ? JSON.parse(newFeatureProperties.value)
      : {};

    const newFeature = {
      featureId: uuidv4(),
      geometryType: geometry.type as SpatialFeatureType,
      geometry,
      properties,
      operation: FeatureOperation.CREATE,
    };

    newFeatures.value.push(newFeature);
    newFeatureProperties.value = "{}";
    newPropertiesError.value = "";
  } catch (error) {
    alert("Invalid properties JSON. Feature created without properties.");
    const newFeature = {
      featureId: uuidv4(),
      geometryType: geometry.type as SpatialFeatureType,
      geometry,
      properties: {},
      operation: FeatureOperation.CREATE,
    };
    newFeatures.value.push(newFeature);
  }
};

const handleFeatureDeleted = (index: number) => {
  const feature = allFeatures.value[index];
  markFeatureAsDeleted(feature);
};

const handleFeatureSelected = (index: number) => {
  const feature = allFeatures.value[index];
  if (feature.operation !== "delete") {
    selectFeatureForEdit(feature, index);
  }
};

const handleGeometryUpdated = (index: number, newGeometry: any) => {
  const feature = allFeatures.value[index];
  const featureId = feature.featureId;

  if (feature.isOriginal) {
    // Update existing feature
    const currentIndex = currentFeatures.value.findIndex(
      (f) => f.featureId === featureId
    );
    if (currentIndex !== -1) {
      currentFeatures.value[currentIndex] = {
        ...currentFeatures.value[currentIndex],
        geometry: newGeometry,
      };

      // Check if it's actually different from original
      const original = originalFeatures.value.find(
        (f) => f.featureId === featureId
      );
      if (original) {
        const hasGeometryChanged = !deepEqual(original.geometry, newGeometry);
        const hasPropertiesChanged = !deepEqual(
          original.properties,
          currentFeatures.value[currentIndex].properties
        );

        if (hasGeometryChanged || hasPropertiesChanged) {
          modifiedFeatureIds.value.add(featureId);
        } else {
          modifiedFeatureIds.value.delete(featureId);
        }
      }
    }
  } else {
    const newIndex = newFeatures.value.findIndex(
      (f) => f.featureId === featureId
    );
    if (newIndex !== -1) {
      newFeatures.value[newIndex] = {
        ...newFeatures.value[newIndex],
        geometry: newGeometry,
      };
    }
  }

  selectedFeature.value = null;
  selectedFeatureIndex.value = null;
};

const selectFeatureForEdit = (feature: any, index: number) => {
  if (feature.operation === "delete" || currentTool.value === "edit") return;

  selectedFeature.value = feature;
  selectedFeatureIndex.value = index;
  selectedFeatureProperties.value = JSON.stringify(
    feature.properties || {},
    null,
    2
  );
  propertiesError.value = "";
  currentTool.value = "select";
};

const saveFeatureProperties = () => {
  if (propertiesError.value) {
    alert("Please fix the JSON errors before saving");
    return;
  }

  try {
    const newProperties = JSON.parse(selectedFeatureProperties.value);
    const featureId = selectedFeature.value.featureId;

    if (selectedFeature.value.isOriginal) {
      // Update existing feature
      const index = currentFeatures.value.findIndex(
        (f) => f.featureId === featureId
      );
      if (index !== -1) {
        currentFeatures.value[index] = {
          ...currentFeatures.value[index],
          properties: newProperties,
        };

        // Check if it's actually different from original
        const original = originalFeatures.value.find(
          (f) => f.featureId === featureId
        );
        if (original) {
          const hasGeometryChanged = !deepEqual(
            original.geometry,
            currentFeatures.value[index].geometry
          );
          const hasPropertiesChanged = !deepEqual(
            original.properties,
            newProperties
          );

          // Only mark as modified if something actually changed
          if (hasGeometryChanged || hasPropertiesChanged) {
            modifiedFeatureIds.value.add(featureId);
          } else {
            modifiedFeatureIds.value.delete(featureId);
          }
        }
      }
    } else {
      // Update new feature
      const index = newFeatures.value.findIndex(
        (f) => f.featureId === featureId
      );
      if (index !== -1) {
        newFeatures.value[index] = {
          ...newFeatures.value[index],
          properties: newProperties,
        };
      }
    }

    selectedFeature.value = null;
    selectedFeatureIndex.value = null;
    alert("Properties saved successfully!");
  } catch (error) {
    alert("Failed to save properties");
  }
};

const cancelPropertyEdit = () => {
  selectedFeature.value = null;
  selectedFeatureIndex.value = null;
};

const markFeatureAsDeleted = (feature: any) => {
  if (!confirm("Are you sure you want to mark this feature for deletion?")) {
    return;
  }

  if (feature.isOriginal) {
    deletedFeatureIds.value.add(feature.featureId);
    modifiedFeatureIds.value.delete(feature.featureId);
  } else {
    // Remove from new features
    const index = newFeatures.value.findIndex(
      (f) => f.featureId === feature.featureId
    );
    if (index !== -1) {
      newFeatures.value.splice(index, 1);
    }
  }

  if (selectedFeature.value?.featureId === feature.featureId) {
    selectedFeature.value = null;
    selectedFeatureIndex.value = null;
  }
};

const restoreFeature = (feature: any) => {
  deletedFeatureIds.value.delete(feature.featureId);
};

const getFeatureCardClass = (feature: any) => {
  const baseClass = "border-2";
  if (
    selectedFeature.value?.featureId === feature.featureId &&
    currentTool.value !== "edit"
  ) {
    return `${baseClass} border-blue-500 bg-blue-50`;
  }
  switch (feature.operation) {
    case "create":
      return `${baseClass} border-green-200 bg-green-50 hover:bg-green-100`;
    case "update":
      return `${baseClass} border-orange-200 bg-orange-50 hover:bg-orange-100`;
    case "delete":
      return `${baseClass} border-red-200 bg-red-50 hover:bg-red-100 opacity-60`;
    default:
      return `${baseClass} border-gray-200 bg-gray-50 hover:bg-gray-100`;
  }
};

const getOperationBadgeClass = (operation: string) => {
  switch (operation) {
    case "create":
      return "bg-green-100 text-green-800";
    case "update":
      return "bg-orange-100 text-orange-800";
    case "delete":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
};

const getOperationLabel = (operation: string) => {
  switch (operation) {
    case "create":
      return "NEW";
    case "update":
      return "MODIFIED";
    case "delete":
      return "DELETED";
    default:
      return "UNCHANGED";
  }
};

// GeoJSON Import Functions
const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];

  if (file) {
    selectedFile.value = file;
    selectedFileName.value = file.name;
    importError.value = "";
    importSuccess.value = "";
  }
};

const clearSelectedFile = () => {
  selectedFile.value = null;
  selectedFileName.value = "";
  importError.value = "";
  importSuccess.value = "";
};

const loadGeoJsonFeatures = async () => {
  if (!selectedFile.value) {
    importError.value = "Please select a file first";
    return;
  }

  importing.value = true;
  importError.value = "";
  importSuccess.value = "";

  try {
    const fileContent = await selectedFile.value.text();
    const geojsonData = JSON.parse(fileContent);

    if (!geojsonData || !geojsonData.type) {
      throw new Error("Invalid GeoJSON format");
    }

    const features =
      geojsonData.type === "FeatureCollection"
        ? geojsonData.features
        : [geojsonData];

    if (!features || features.length === 0) {
      throw new Error("No features found in GeoJSON file");
    }

    let loadedCount = 0;
    for (const feature of features) {
      if (!feature.geometry) {
        console.warn("Skipping feature without geometry");
        continue;
      }

      const featureId =
        feature.id?.toString() ||
        feature.properties?.id?.toString() ||
        feature.properties?.fid?.toString() ||
        uuidv4();

      // Map geometry type
      const geometryTypeMap: Record<string, SpatialFeatureType> = {
        Point: SpatialFeatureType.POINT,
        LineString: SpatialFeatureType.LINE,
        Polygon: SpatialFeatureType.POLYGON,
        MultiPoint: SpatialFeatureType.MULTIPOINT,
        MultiLineString: SpatialFeatureType.MULTILINE,
        MultiPolygon: SpatialFeatureType.MULTIPOLYGON,
      };

      const geometryType = geometryTypeMap[feature.geometry.type];
      if (!geometryType) {
        console.warn(
          `Unsupported geometry type: ${feature.geometry.type}, skipping feature`
        );
        continue;
      }

      newFeatures.value.push({
        featureId,
        geometryType,
        geometry: feature.geometry,
        properties: feature.properties || {},
        operation: FeatureOperation.CREATE,
      });

      loadedCount++;
    }

    importSuccess.value = `Successfully loaded ${loadedCount} feature(s) to the map. Review and click "Commit Changes" when ready.`;

    clearSelectedFile();

    setTimeout(() => {
      importSuccess.value = "";
    }, 5000);
  } catch (error: any) {
    console.error("Import error:", error);
    if (error instanceof SyntaxError) {
      importError.value = "Invalid JSON format in the file";
    } else {
      importError.value = error.message || "Failed to load GeoJSON file";
    }
  } finally {
    importing.value = false;
  }
};

const handleCommit = async () => {
  if (!canCommit.value) return;

  const features: SpatialFeatureRequest[] = [];

  for (const featureId of modifiedFeatureIds.value) {
    const feature = currentFeatures.value.find(
      (f) => f.featureId === featureId
    );
    if (feature) {
      features.push({
        featureId: feature.featureId,
        geometryType: convertGeometryTypeForAPI(feature.geometryType),
        geometry: feature.geometry,
        properties: feature.properties,
        operation: FeatureOperation.UPDATE,
      });
    }
  }

  for (const featureId of deletedFeatureIds.value) {
    const feature = originalFeatures.value.find(
      (f) => f.featureId === featureId
    );
    if (feature) {
      features.push({
        featureId: feature.featureId,
        geometryType: convertGeometryTypeForAPI(feature.geometryType),
        geometry: feature.geometry,
        properties: feature.properties,
        operation: FeatureOperation.DELETE,
      });
    }
  }

  for (const feature of newFeatures.value) {
    features.push({
      featureId: feature.featureId,
      geometryType: convertGeometryTypeForAPI(feature.geometryType),
      geometry: feature.geometry,
      properties: feature.properties,
      operation: FeatureOperation.CREATE,
    });
  }

  if (features.length === 0) {
    alert("No changes to commit");
    return;
  }

  try {
    await spatialStore.createCommit({
      message: commitMessage.value,
      branchId,
      features,
    });

    alert("Commit created successfully!");
    router.push(`/datasets/${datasetId}/branches/${branchId}`);
  } catch (error: any) {
    alert(error.response?.data?.message || "Failed to create commit");
  }
};

const handleCancel = () => {
  if (totalChanges.value > 0) {
    if (
      !confirm("You have unsaved changes. Are you sure you want to cancel?")
    ) {
      return;
    }
  }
  router.back();
};

onMounted(() => {
  loadCurrentFeatures();
});
</script>

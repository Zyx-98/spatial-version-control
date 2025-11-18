<template>
  <div class="enhanced-commit-changes">
    <div class="bg-gray-50 px-6 py-4 border-b">
      <h3 class="text-lg font-semibold text-gray-900">{{ commit.message }}</h3>
      <p class="text-sm text-gray-600 mt-1">
        by {{ commit.author?.username || "Unknown" }} on
        {{ formatDate(commit.createdAt) }}
      </p>
    </div>

    <div class="p-4">
      <div class="grid grid-cols-3 gap-4 mb-6">
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

      <div class="mb-6">
        <h4 class="text-md font-semibold mb-3">Changes Visualization</h4>
        <div
          :id="mapId"
          class="h-[350px] rounded-lg border border-gray-300"
        ></div>
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

      <div>
        <div class="flex justify-between items-center mb-3">
          <h4 class="text-md font-semibold">Feature Details</h4>
          <button
            v-if="filterBy !== 'all'"
            @click="filterBy = 'all'"
            class="text-sm text-primary-600 hover:text-primary-800"
          >
            Show all
          </button>
        </div>

        <div class="space-y-3 max-h-[400px] overflow-y-auto pr-2">
          <div
            v-for="feature in filteredCreatedFeatures"
            :key="'create-' + feature.id"
            @mouseenter="highlightFeature(feature.featureId)"
            @mouseleave="clearHighlight()"
            class="transition-all"
            :class="{
              'ring-2 ring-green-400':
                highlightedFeatureId === feature.featureId,
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

          <div
            v-for="feature in filteredUpdatedFeatures"
            :key="'update-' + feature.id"
            @mouseenter="highlightFeature(feature.featureId)"
            @mouseleave="clearHighlight()"
            class="transition-all"
            :class="{
              'ring-2 ring-blue-400':
                highlightedFeatureId === feature.featureId,
            }"
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
            @mouseenter="highlightFeature(feature.featureId)"
            @mouseleave="clearHighlight()"
            class="transition-all"
            :class="{
              'ring-2 ring-red-400':
                highlightedFeatureId === feature.featureId,
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from "vue";
import { format } from "date-fns";
import L from "leaflet";
import { SpatialFeatureType, type CommitChanges, type SpatialFeature } from "@/types";
import FeatureDiff from "./FeatureDiff.vue";
import "leaflet/dist/leaflet.css";

interface Props {
  commit: CommitChanges["commit"];
  changes: CommitChanges["changes"];
}

const props = defineProps<Props>();

const mapId = ref(`commit-map-${Math.random().toString(36).substr(2, 9)}`);
const filterBy = ref<"all" | "created" | "updated" | "deleted">("all");
const highlightedFeatureId = ref<string | null>(null);

let map: L.Map | null = null;
let featureLayer: L.LayerGroup | null = null;
let highlightLayer: L.LayerGroup | null = null;

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

const getColor = (operation: string) => {
  switch (operation) {
    case "create":
      return "#10b981";
    case "update":
      return "#3b82f6";
    case "delete":
      return "#ef4444";
    default:
      return "#6b7280";
  }
};

const renderFeature = (
  feature: SpatialFeature,
  layer: L.LayerGroup,
  color: string,
  isHighlighted: boolean
) => {
  if (!feature.geometry || !feature.geometry.coordinates) return null;

  const coords = feature.geometry.coordinates;
  let leafletLayer: L.Layer | null = null;
  const weight = isHighlighted ? 6 : 3;
  const opacity = isHighlighted ? 1 : 0.7;

  try {
    switch (feature.geometryType) {
      case "Point":
        const [lng, lat] = coords;
        leafletLayer = L.circleMarker([lat, lng], {
          radius: isHighlighted ? 14 : 10,
          fillColor: color,
          color: isHighlighted ? "#000" : "#fff",
          weight: weight,
          opacity: 1,
          fillOpacity: opacity,
        });
        break;

      case "Line":
      case "LineString":
        const lineCoords = coords.map(
          (c: number[]) => [c[1], c[0]] as L.LatLngExpression
        );
        leafletLayer = L.polyline(lineCoords, {
          color: color,
          weight: weight,
          opacity: opacity,
        });
        break;

      case "Polygon":
        const polygonCoords = coords[0].map(
          (c: number[]) => [c[1], c[0]] as L.LatLngExpression
        );
        leafletLayer = L.polygon(polygonCoords, {
          fillColor: color,
          color: isHighlighted ? "#000" : color,
          weight: weight,
          opacity: opacity,
          fillOpacity: opacity * 0.5,
        });
        break;
    }

    if (leafletLayer) {
      leafletLayer.addTo(layer);
    }

    return leafletLayer;
  } catch (error) {
    console.error("Error rendering feature:", error);
    return null;
  }
};

const renderFeatures = () => {
  if (!featureLayer) return;
  featureLayer.clearLayers();

  const allBounds: L.LatLngBounds[] = [];

  const renderAndCollectBounds = (features: SpatialFeature[], operation: string) => {
    features.forEach((feature) => {
      if (!feature.geometry?.coordinates) return;

      const isHighlighted = highlightedFeatureId.value === feature.featureId;
      renderFeature(feature, featureLayer!, getColor(operation), isHighlighted);

      const coords = feature.geometry.coordinates;
      try {
        switch (feature.geometryType) {
          case SpatialFeatureType.POINT:
            allBounds.push(
              L.latLngBounds([coords[1], coords[0]], [coords[1], coords[0]])
            );
            break;
          case SpatialFeatureType.LINE:
          case SpatialFeatureType.LINESTRING:
            const lineCoords = coords.map((c: number[]) => [c[1], c[0]]);
            allBounds.push(L.latLngBounds(lineCoords as L.LatLngExpression[]));
            break;
          case SpatialFeatureType.POLYGON:
            const polygonCoords = coords[0].map((c: number[]) => [c[1], c[0]]);
            allBounds.push(
              L.latLngBounds(polygonCoords as L.LatLngExpression[])
            );
            break;
        }
      } catch (e) {
        console.log("🚀 ~ renderAndCollectBounds ~ e:", e)
      }
    });
  };

  renderAndCollectBounds(props.changes.created, "create");
  renderAndCollectBounds(props.changes.updated, "update");
  renderAndCollectBounds(props.changes.deleted, "delete");

  if (allBounds.length > 0 && map) {
    const combinedBounds = allBounds.reduce((acc, bounds) =>
      acc.extend(bounds)
    );
    map.fitBounds(combinedBounds, { padding: [30, 30] });
  }
};

const highlightFeature = (featureId: string) => {
  highlightedFeatureId.value = featureId;
  renderFeatures();
};

const clearHighlight = () => {
  highlightedFeatureId.value = null;
  renderFeatures();
};

const initMap = () => {
  map = L.map(mapId.value).setView([37.7749, -122.4194], 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap",
    maxZoom: 19,
  }).addTo(map);
  featureLayer = L.layerGroup().addTo(map);
  highlightLayer = L.layerGroup().addTo(map);
};

watch(
  () => props.changes,
  () => renderFeatures(),
  { deep: true }
);

onMounted(() => {
  initMap();
  renderFeatures();
});

onBeforeUnmount(() => {
  if (map) {
    map.remove();
    map = null;
  }
});
</script>

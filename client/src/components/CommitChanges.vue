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
            @mouseenter="highlightFeature(feature.id)"
            @mouseleave="clearHighlight()"
            class="transition-all"
            :class="{
              'ring-2 ring-green-400':
                highlightedFeatureId === feature.id,
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
            @mouseenter="highlightFeature(feature.id)"
            @mouseleave="clearHighlight()"
            class="transition-all"
            :class="{
              'ring-2 ring-blue-400':
                highlightedFeatureId === feature.id,
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
            @mouseenter="highlightFeature(feature.id)"
            @mouseleave="clearHighlight()"
            class="transition-all"
            :class="{
              'ring-2 ring-red-400':
                highlightedFeatureId === feature.id,
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
import maplibregl from "maplibre-gl";
import { SpatialFeatureType, type CommitChanges } from "@/types";
import FeatureDiff from "./FeatureDiff.vue";
import "maplibre-gl/dist/maplibre-gl.css";

interface Props {
  commit: CommitChanges["commit"];
  changes: CommitChanges["changes"];
}

const props = defineProps<Props>();

const mapId = ref(`commit-map-${Math.random().toString(36).substr(2, 9)}`);
const filterBy = ref<"all" | "created" | "updated" | "deleted">("all");
const highlightedFeatureId = ref<string | null>(null);

let map: maplibregl.Map | null = null;

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

const getAllFeatures = () => {
  return [
    ...props.changes.created.map((f) => ({ ...f, operation: "create" })),
    ...props.changes.updated.map((f) => ({ ...f, operation: "update" })),
    ...props.changes.deleted.map((f) => ({ ...f, operation: "delete" })),
  ];
};

const convertToGeoJSON = () => {
  const allFeatures = getAllFeatures();

  return {
    type: "FeatureCollection",
    features: allFeatures.map((feature) => {
      const isHighlighted = highlightedFeatureId.value === feature.id;
      const color = getColor(feature.operation);

      return {
        type: "Feature",
        id: feature.id,
        geometry: {
          type: feature.geometryType,
          coordinates: feature.geometry.coordinates,
        },
        properties: {
          ...feature.properties,
          color,
          isHighlighted,
          operation: feature.operation,
          featureId: feature.id,
          geometryType: feature.geometryType,
        },
      };
    }),
  };
};

const renderFeatures = () => {
  if (!map || !map.loaded()) return;

  // Remove existing layers and sources
  ["features-fill", "features-line", "features-point"].forEach((layerId) => {
    if (map!.getLayer(layerId)) {
      map!.removeLayer(layerId);
    }
  });

  if (map.getSource("features")) {
    map.removeSource("features");
  }

  const allFeatures = getAllFeatures();
  if (allFeatures.length === 0) return;

  // Add GeoJSON source
  const geojson = convertToGeoJSON();
  map.addSource("features", {
    type: "geojson",
    data: geojson as any,
  });

  // Add fill layer for polygons
  map.addLayer({
    id: "features-fill",
    type: "fill",
    source: "features",
    filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]],
    paint: {
      "fill-color": ["get", "color"],
      "fill-opacity": 0.35,
    },
  });

  // Add line layer
  map.addLayer({
    id: "features-line",
    type: "line",
    source: "features",
    filter: [
      "in",
      ["geometry-type"],
      ["literal", ["LineString", "MultiLineString", "Polygon", "MultiPolygon"]],
    ],
    paint: {
      "line-color": [
        "case",
        ["get", "isHighlighted"],
        "#000000",
        ["get", "color"],
      ],
      "line-width": [
        "case",
        ["get", "isHighlighted"],
        6,
        3,
      ],
      "line-opacity": [
        "case",
        ["get", "isHighlighted"],
        1,
        0.7,
      ],
    },
  });

  // Add circle layer for points
  map.addLayer({
    id: "features-point",
    type: "circle",
    source: "features",
    filter: ["in", ["geometry-type"], ["literal", ["Point", "MultiPoint"]]],
    paint: {
      "circle-radius": [
        "case",
        ["get", "isHighlighted"],
        14,
        10,
      ],
      "circle-color": ["get", "color"],
      "circle-opacity": [
        "case",
        ["get", "isHighlighted"],
        1,
        0.7,
      ],
      "circle-stroke-color": [
        "case",
        ["get", "isHighlighted"],
        "#000000",
        "#ffffff",
      ],
      "circle-stroke-width": [
        "case",
        ["get", "isHighlighted"],
        6,
        3,
      ],
    },
  });

  // Fit bounds
  const allCoordinates: [number, number][] = [];

  allFeatures.forEach((feature) => {
    if (!feature.geometry?.coordinates) return;
    const coords = feature.geometry.coordinates;

    try {
      switch (feature.geometryType) {
        case SpatialFeatureType.POINT:
          allCoordinates.push([coords[0], coords[1]]);
          break;
        case SpatialFeatureType.LINE:
          allCoordinates.push(...(coords as [number, number][]));
          break;
        case SpatialFeatureType.POLYGON:
          allCoordinates.push(...(coords[0] as [number, number][]));
          break;
      }
    } catch (e) {
      console.log("Error collecting bounds:", e);
    }
  });

  if (allCoordinates.length > 0) {
    const bounds = allCoordinates.reduce(
      (bounds, coord) => bounds.extend(coord),
      new maplibregl.LngLatBounds(allCoordinates[0], allCoordinates[0])
    );

    map.fitBounds(bounds, { padding: 30 });
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
  map = new maplibregl.Map({
    container: mapId.value,
    style: {
      version: 8,
      sources: {
        osm: {
          type: "raster",
          tiles: ["https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: "&copy; OpenStreetMap Contributors",
          maxzoom: 19,
        },
      },
      layers: [
        {
          id: "osm",
          type: "raster",
          source: "osm",
        },
      ],
    },
    center: [-122.4194, 37.7749],
    zoom: 13,
  });
};

watch(
  () => props.changes,
  () => {
    if (map && map.loaded()) {
      renderFeatures();
    }
  },
  { deep: true }
);

onMounted(() => {
  initMap();
  map!.on("load", () => {
    renderFeatures();
  });
});

onBeforeUnmount(() => {
  if (map) {
    map.remove();
    map = null;
  }
});
</script>

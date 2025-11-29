<template>
  <div class="split-map-container">
    <div class="grid grid-cols-2 gap-2 h-full">
      <div class="relative">
        <div class="absolute top-2 left-2 z-10 bg-white px-3 py-1 rounded shadow">
          <span class="font-medium text-sm text-gray-700">{{ leftLabel }}</span>
        </div>
        <div :id="leftMapId" class="h-full rounded-lg border border-gray-300"></div>
      </div>

      <div class="relative">
        <div class="absolute top-2 left-2 z-10 bg-white px-3 py-1 rounded shadow">
          <span class="font-medium text-sm text-gray-700">{{ rightLabel }}</span>
        </div>
        <div :id="rightMapId" class="h-full rounded-lg border border-gray-300"></div>
      </div>
    </div>

    <div class="mt-2 flex justify-center space-x-4">
      <label class="flex items-center space-x-2 text-sm text-gray-600">
        <input type="checkbox" v-model="syncMaps" class="rounded" />
        <span>Sync map movement</span>
      </label>
      <button
        @click="fitBounds"
        class="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
      >
        Fit to features
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, computed } from "vue";
import maplibregl from "maplibre-gl";
import { SpatialFeatureType, type SpatialFeature } from "@/types";
import { useMvtLayer } from "@/composables/useMvtLayer";
import "maplibre-gl/dist/maplibre-gl.css";

interface Props {
  // GeoJSON mode
  leftFeatures?: SpatialFeature[];
  rightFeatures?: SpatialFeature[];
  // MVT mode
  leftBranchId?: string;
  rightBranchId?: string;
  // Common props
  leftLabel?: string;
  rightLabel?: string;
  leftColor?: string;
  rightColor?: string;
  height?: number;
  highlightedFeatureId?: string | null;
}

const props = withDefaults(defineProps<Props>(), {
  leftLabel: "Before",
  rightLabel: "After",
  leftColor: "#ef4444",
  rightColor: "#10b981",
  height: 400,
  highlightedFeatureId: null,
});

const leftMapId = ref(`left-map-${Math.random().toString(36).substring(2, 11)}`);
const rightMapId = ref(`right-map-${Math.random().toString(36).substring(2, 11)}`);

let leftMap: maplibregl.Map | null = null;
let rightMap: maplibregl.Map | null = null;
let isSyncing = false;

const syncMaps = ref(true);

// MVT composable
const { addBranchMvtLayer, removeMvtLayer, fitBranchBounds } = useMvtLayer();

// Determine rendering mode
const useMvt = computed(() => !!(props.leftBranchId || props.rightBranchId));

const initMaps = () => {
  // Initialize left map
  leftMap = new maplibregl.Map({
    container: leftMapId.value,
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

  // Initialize right map
  rightMap = new maplibregl.Map({
    container: rightMapId.value,
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

  // Sync map movements
  leftMap.on("move", () => {
    if (syncMaps.value && rightMap && !isSyncing) {
      isSyncing = true;
      rightMap.setCenter(leftMap!.getCenter());
      rightMap.setZoom(leftMap!.getZoom());
      rightMap.setBearing(leftMap!.getBearing());
      rightMap.setPitch(leftMap!.getPitch());
      isSyncing = false;
    }
  });

  rightMap.on("move", () => {
    if (syncMaps.value && leftMap && !isSyncing) {
      isSyncing = true;
      leftMap.setCenter(rightMap!.getCenter());
      leftMap.setZoom(rightMap!.getZoom());
      leftMap.setBearing(rightMap!.getBearing());
      leftMap.setPitch(rightMap!.getPitch());
      isSyncing = false;
    }
  });
};

const convertToGeoJSON = (features: SpatialFeature[], color: string) => {
  return {
    type: "FeatureCollection",
    features: features.map((feature) => {
      const isHighlighted = feature.id === props.highlightedFeatureId;
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
          featureId: feature.id,
          geometryType: feature.geometryType,
        },
      };
    }),
  };
};

const renderFeaturesOnMap = (
  map: maplibregl.Map,
  features: SpatialFeature[],
  color: string,
  sourcePrefix: string
) => {
  if (!map || !map.loaded()) return;

  // Remove existing layers and sources
  [`${sourcePrefix}-fill`, `${sourcePrefix}-line`, `${sourcePrefix}-point`].forEach(
    (layerId) => {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
    }
  );

  if (map.getSource(sourcePrefix)) {
    map.removeSource(sourcePrefix);
  }

  if (features.length === 0) return;

  // Add GeoJSON source
  const geojson = convertToGeoJSON(features, color);
  map.addSource(sourcePrefix, {
    type: "geojson",
    data: geojson as any,
  });

  // Add fill layer for polygons
  map.addLayer({
    id: `${sourcePrefix}-fill`,
    type: "fill",
    source: sourcePrefix,
    filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]],
    paint: {
      "fill-color": ["get", "color"],
      "fill-opacity": 0.35,
    },
  });

  // Add line layer
  map.addLayer({
    id: `${sourcePrefix}-line`,
    type: "line",
    source: sourcePrefix,
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
        5,
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
    id: `${sourcePrefix}-point`,
    type: "circle",
    source: sourcePrefix,
    filter: ["in", ["geometry-type"], ["literal", ["Point", "MultiPoint"]]],
    paint: {
      "circle-radius": [
        "case",
        ["get", "isHighlighted"],
        12,
        8,
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
        5,
        3,
      ],
    },
  });
};

const renderFeatures = () => {
  if (!leftMap || !rightMap || !leftMap.loaded() || !rightMap.loaded()) return;

  if (useMvt.value) {
    // MVT mode - render tiles
    if (props.leftBranchId) {
      addBranchMvtLayer(leftMap, props.leftBranchId, {
        sourceId: `left-branch-${props.leftBranchId}`,
        color: props.leftColor,
      });
    }

    if (props.rightBranchId) {
      addBranchMvtLayer(rightMap, props.rightBranchId, {
        sourceId: `right-branch-${props.rightBranchId}`,
        color: props.rightColor,
      });
    }

    // Fit bounds to first branch that has data
    if (props.leftBranchId) {
      fitBranchBounds(leftMap, props.leftBranchId).then(() => {
        if (props.rightBranchId && rightMap) {
          isSyncing = true;
          rightMap.setCenter(leftMap!.getCenter());
          rightMap.setZoom(leftMap!.getZoom());
          isSyncing = false;
        }
      });
    } else if (props.rightBranchId) {
      fitBranchBounds(rightMap, props.rightBranchId);
    }
  } else if (props.leftFeatures && props.rightFeatures) {
    // GeoJSON mode - render features
    renderFeaturesOnMap(leftMap, props.leftFeatures, props.leftColor, "left-features");
    renderFeaturesOnMap(rightMap, props.rightFeatures, props.rightColor, "right-features");
    fitBounds();
  }
};

const fitBounds = () => {
  if (!props.leftFeatures && !props.rightFeatures) return;

  const allCoordinates: [number, number][] = [];

  const collectCoordinates = (features: SpatialFeature[]) => {
    features.forEach((feature) => {
      if (!feature.geometry?.coordinates) return;
      const coords = feature.geometry.coordinates;

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
    });
  };

  if (props.leftFeatures) collectCoordinates(props.leftFeatures);
  if (props.rightFeatures) collectCoordinates(props.rightFeatures);

  if (allCoordinates.length > 0 && leftMap && rightMap) {
    const bounds = allCoordinates.reduce(
      (bounds, coord) => bounds.extend(coord),
      new maplibregl.LngLatBounds(allCoordinates[0], allCoordinates[0])
    );

    isSyncing = true;
    leftMap.fitBounds(bounds, { padding: 20 });
    rightMap.fitBounds(bounds, { padding: 20 });
    isSyncing = false;
  }
};

watch(
  () => [props.leftFeatures, props.rightFeatures, props.highlightedFeatureId],
  () => {
    if (leftMap && rightMap && leftMap.loaded() && rightMap.loaded()) {
      renderFeatures();
    }
  },
  { deep: true }
);

onMounted(() => {
  initMaps();

  // Wait for both maps to load before rendering
  let leftLoaded = false;
  let rightLoaded = false;

  leftMap!.on("load", () => {
    leftLoaded = true;
    if (rightLoaded) {
      renderFeatures();
    }
  });

  rightMap!.on("load", () => {
    rightLoaded = true;
    if (leftLoaded) {
      renderFeatures();
    }
  });
});

onBeforeUnmount(() => {
  // Clean up MVT layers if in MVT mode
  if (useMvt.value) {
    if (leftMap && props.leftBranchId) {
      removeMvtLayer(leftMap, `left-branch-${props.leftBranchId}`);
    }
    if (rightMap && props.rightBranchId) {
      removeMvtLayer(rightMap, `right-branch-${props.rightBranchId}`);
    }
  }

  if (leftMap) {
    leftMap.remove();
    leftMap = null;
  }
  if (rightMap) {
    rightMap.remove();
    rightMap = null;
  }
});
</script>

<style scoped>
.split-map-container {
  height: v-bind("`${height}px`");
}
</style>

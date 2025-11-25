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
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import maplibregl from "maplibre-gl";
import { SpatialFeatureType, type SpatialFeature } from "@/types";
import "maplibre-gl/dist/maplibre-gl.css";

interface Props {
  leftFeatures: SpatialFeature[];
  rightFeatures: SpatialFeature[];
  leftLabel?: string;
  rightLabel?: string;
  height?: number;
  highlightedFeatureId?: string | null;
}

const props = withDefaults(defineProps<Props>(), {
  leftLabel: "Before",
  rightLabel: "After",
  height: 400,
  highlightedFeatureId: null,
});

const leftMapId = ref(`left-map-${Math.random().toString(36).substring(2, 11)}`);
const rightMapId = ref(`right-map-${Math.random().toString(36).substring(2, 11)}`);

let leftMap: maplibregl.Map | null = null;
let rightMap: maplibregl.Map | null = null;
let isSyncing = false;

const syncMaps = ref(true);

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

  // Render left features (older/target version) in red
  renderFeaturesOnMap(leftMap, props.leftFeatures, "#ef4444", "left-features");

  // Render right features (newer/source version) in green
  renderFeaturesOnMap(rightMap, props.rightFeatures, "#10b981", "right-features");

  fitBounds();
};

const fitBounds = () => {
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

  collectCoordinates(props.leftFeatures);
  collectCoordinates(props.rightFeatures);

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

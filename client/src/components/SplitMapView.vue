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
import L from "leaflet";
import { SpatialFeatureType, type SpatialFeature } from "@/types";
import "leaflet/dist/leaflet.css";

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

const leftMapId = ref(`left-map-${Math.random().toString(36).substr(2, 9)}`);
const rightMapId = ref(`right-map-${Math.random().toString(36).substr(2, 9)}`);

let leftMap: L.Map | null = null;
let rightMap: L.Map | null = null;
let leftLayer: L.LayerGroup | null = null;
let rightLayer: L.LayerGroup | null = null;
let isSyncing = false;

const syncMaps = ref(true);

const initMaps = () => {
  // Initialize left map
  leftMap = L.map(leftMapId.value).setView([37.7749, -122.4194], 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap",
    maxZoom: 19,
  }).addTo(leftMap);
  leftLayer = L.layerGroup().addTo(leftMap);

  // Initialize right map
  rightMap = L.map(rightMapId.value).setView([37.7749, -122.4194], 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap",
    maxZoom: 19,
  }).addTo(rightMap);
  rightLayer = L.layerGroup().addTo(rightMap);

  // Sync map movements
  leftMap.on("move", () => {
    if (syncMaps.value && rightMap && !isSyncing) {
      isSyncing = true;
      rightMap.setView(leftMap!.getCenter(), leftMap!.getZoom());
      isSyncing = false;
    }
  });

  rightMap.on("move", () => {
    if (syncMaps.value && leftMap && !isSyncing) {
      isSyncing = true;
      leftMap.setView(rightMap!.getCenter(), rightMap!.getZoom());
      isSyncing = false;
    }
  });
};

const renderFeature = (
  feature: SpatialFeature,
  layer: L.LayerGroup,
  color: string,
  isHighlighted: boolean
) => {
  if (!feature.geometry || !feature.geometry.coordinates) return;

  const coords = feature.geometry.coordinates;
  let leafletLayer: L.Layer | null = null;
  const weight = isHighlighted ? 5 : 3;
  const opacity = isHighlighted ? 1 : 0.7;

  try {
    switch (feature.geometryType) {
      case "Point":
        const [lng, lat] = coords;
        leafletLayer = L.circleMarker([lat, lng], {
          radius: isHighlighted ? 12 : 8,
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
  } catch (error) {
    console.error("Error rendering feature:", error);
  }
};

const renderFeatures = () => {
  if (!leftLayer || !rightLayer) return;

  leftLayer.clearLayers();
  rightLayer.clearLayers();

  // Render left features (older/target version)
  props.leftFeatures.forEach((feature) => {
    const isHighlighted = feature.featureId === props.highlightedFeatureId;
    renderFeature(feature, leftLayer!, "#ef4444", isHighlighted); // Red for old
  });

  // Render right features (newer/source version)
  props.rightFeatures.forEach((feature) => {
    const isHighlighted = feature.featureId === props.highlightedFeatureId;
    renderFeature(feature, rightLayer!, "#10b981", isHighlighted); // Green for new
  });

  fitBounds();
};

const fitBounds = () => {
  const allBounds: L.LatLngBounds[] = [];

  const collectBounds = (features: SpatialFeature[]) => {
    features.forEach((feature) => {
      if (!feature.geometry?.coordinates) return;
      const coords = feature.geometry.coordinates;

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
    });
  };

  collectBounds(props.leftFeatures);
  collectBounds(props.rightFeatures);

  if (allBounds.length > 0 && leftMap && rightMap) {
    const combinedBounds = allBounds.reduce((acc, bounds) =>
      acc.extend(bounds)
    );
    isSyncing = true;
    leftMap.fitBounds(combinedBounds, { padding: [20, 20] });
    rightMap.fitBounds(combinedBounds, { padding: [20, 20] });
    isSyncing = false;
  }
};

watch(
  () => [props.leftFeatures, props.rightFeatures, props.highlightedFeatureId],
  () => renderFeatures(),
  { deep: true }
);

onMounted(() => {
  initMaps();
  renderFeatures();
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

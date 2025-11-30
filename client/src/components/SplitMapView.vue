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

    <div class="mt-2 flex justify-center">
      <label class="flex items-center space-x-2 text-sm text-gray-600">
        <input type="checkbox" v-model="syncMaps" class="rounded" />
        <span>Sync map movement</span>
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import maplibregl from "maplibre-gl";
import { useMvtLayer } from "@/composables/useMvtLayer";
import "maplibre-gl/dist/maplibre-gl.css";

interface Props {
  leftBranchId: string;
  rightBranchId: string;
  leftLabel?: string;
  rightLabel?: string;
  leftColor?: string;
  rightColor?: string;
  height?: number;
}

const props = withDefaults(defineProps<Props>(), {
  leftLabel: "Before",
  rightLabel: "After",
  leftColor: "#ef4444",
  rightColor: "#10b981",
  height: 400,
});

const leftMapId = ref(`left-map-${Math.random().toString(36).substring(2, 11)}`);
const rightMapId = ref(`right-map-${Math.random().toString(36).substring(2, 11)}`);

let leftMap: maplibregl.Map | null = null;
let rightMap: maplibregl.Map | null = null;
let isSyncing = false;

const syncMaps = ref(true);

// MVT composable
const { addBranchMvtLayer, removeMvtLayer, fitBranchBounds } = useMvtLayer();

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


const renderFeatures = () => {
  if (!leftMap || !rightMap || !leftMap.loaded() || !rightMap.loaded()) return;

  // Render MVT tiles for both branches
  addBranchMvtLayer(leftMap, props.leftBranchId, {
    sourceId: `left-branch-${props.leftBranchId}`,
    color: props.leftColor,
  });

  addBranchMvtLayer(rightMap, props.rightBranchId, {
    sourceId: `right-branch-${props.rightBranchId}`,
    color: props.rightColor,
  });

  // Fit bounds to left branch and sync right map
  fitBranchBounds(leftMap, props.leftBranchId).then(() => {
    if (rightMap) {
      isSyncing = true;
      rightMap.setCenter(leftMap!.getCenter());
      rightMap.setZoom(leftMap!.getZoom());
      isSyncing = false;
    }
  });
};


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
  // Clean up MVT layers
  if (leftMap) {
    removeMvtLayer(leftMap, `left-branch-${props.leftBranchId}`);
    leftMap.remove();
    leftMap = null;
  }
  if (rightMap) {
    removeMvtLayer(rightMap, `right-branch-${props.rightBranchId}`);
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

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

    <div class="mt-2 flex justify-center items-center gap-4">
      <label class="flex items-center space-x-2 text-sm text-gray-600">
        <input type="checkbox" v-model="syncMaps" class="rounded" />
        <span>Sync map movement</span>
      </label>
      <button
        @click="fitBothMaps"
        class="flex items-center gap-2 px-3 py-1.5 bg-primary-600 text-white text-sm rounded hover:bg-primary-700 transition"
        title="Fit both maps to features"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path>
        </svg>
        Fit to Features
      </button>
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

// Fit both maps to their respective features
const fitBothMaps = () => {
  if (!leftMap || !rightMap || !props.leftBranchId || !props.rightBranchId) return;

  // Fit left map first
  fitBranchBounds(leftMap, props.leftBranchId)
    .then(() => {
      if (syncMaps.value && rightMap) {
        // If sync is enabled, sync right map to left
        isSyncing = true;
        rightMap.setCenter(leftMap!.getCenter());
        rightMap.setZoom(leftMap!.getZoom());
        isSyncing = false;
      } else if (!syncMaps.value && rightMap) {
        // If sync is disabled, fit right map independently
        return fitBranchBounds(rightMap, props.rightBranchId);
      }
    })
    .catch((error) => {
      console.error('[SplitMapView] Failed to fit maps:', error);
    });
};

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
  if (!leftMap || !rightMap) {
    console.warn('[SplitMapView] Maps not initialized');
    return;
  }


  if (!props.leftBranchId || !props.rightBranchId) {
    console.error('[SplitMapView] Missing branch IDs:', {
      left: props.leftBranchId,
      right: props.rightBranchId,
    });
    return;
  }

  let leftIdle = false;
  let rightIdle = false;

  const addLayers = () => {
    if (!leftIdle || !rightIdle) return;

    try {
      addBranchMvtLayer(leftMap!, props.leftBranchId, {
        sourceId: `left-branch-${props.leftBranchId}`,
        color: props.leftColor,
        layerName: 'features',
      });

      addBranchMvtLayer(rightMap!, props.rightBranchId, {
        sourceId: `right-branch-${props.rightBranchId}`,
        color: props.rightColor,
        layerName: 'features',
      });

      fitBranchBounds(leftMap!, props.leftBranchId)
        .then(() => {
          if (rightMap) {
            isSyncing = true;
            rightMap.setCenter(leftMap!.getCenter());
            rightMap.setZoom(leftMap!.getZoom());
            isSyncing = false;
          }
        })
        .catch((error) => {
          console.error('[SplitMapView] Failed to fit bounds:', error);
        });
    } catch (error) {
      console.error('[SplitMapView] Failed to render MVT layers:', error);
    }
  };

  leftMap.once('idle', () => {
    leftIdle = true;
    addLayers();
  });

  rightMap.once('idle', () => {
    rightIdle = true;
    addLayers();
  });
};


onMounted(() => {
  initMaps();

  let leftLoaded = false;
  let rightLoaded = false;

  const checkAndRender = () => {
    if (leftLoaded && rightLoaded) {
      renderFeatures();
    }
  };

  const handleLeftLoad = () => {
    leftLoaded = true;
    checkAndRender();
  };

  const handleRightLoad = () => {
    rightLoaded = true;
    checkAndRender();
  };

  if (leftMap!.loaded()) {
    leftLoaded = true;
  } else {
    leftMap!.on("load", handleLeftLoad);
  }

  if (rightMap!.loaded()) {
    rightLoaded = true;
  } else {
    rightMap!.on("load", handleRightLoad);
  }

  // Check immediately in case both were already loaded
  checkAndRender();
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

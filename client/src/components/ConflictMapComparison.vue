<template>
  <div class="grid grid-cols-2 gap-4">
    <!-- Main Branch Map -->
    <div class="border-2 border-blue-300 rounded-lg overflow-hidden">
      <div class="bg-blue-50 px-3 py-2 border-b border-blue-200">
        <div class="flex items-center justify-between">
          <span class="text-sm font-semibold text-blue-900">Main Branch</span>
          <span class="text-xs px-2 py-1 bg-blue-200 text-blue-800 rounded">
            {{ mainGeometryType }}
          </span>
        </div>
      </div>
      <div :id="mainMapId" class="h-64"></div>
    </div>

    <!-- Feature Branch Map -->
    <div class="border-2 border-green-300 rounded-lg overflow-hidden">
      <div class="bg-green-50 px-3 py-2 border-b border-green-200">
        <div class="flex items-center justify-between">
          <span class="text-sm font-semibold text-green-900">Feature Branch</span>
          <span class="text-xs px-2 py-1 bg-green-200 text-green-800 rounded">
            {{ branchGeometryType }}
          </span>
        </div>
      </div>
      <div :id="branchMapId" class="h-64"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, computed } from "vue";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface Props {
  mainGeometry: any;
  branchGeometry: any;
}

const props = defineProps<Props>();

const mainMapId = ref(`main-map-${Math.random().toString(36).substr(2, 9)}`);
const branchMapId = ref(`branch-map-${Math.random().toString(36).substr(2, 9)}`);

let mainMap: L.Map | null = null;
let branchMap: L.Map | null = null;
let mainLayer: L.Layer | null = null;
let branchLayer: L.Layer | null = null;

const mainGeometryType = computed(() => props.mainGeometry?.type || "Unknown");
const branchGeometryType = computed(() => props.branchGeometry?.type || "Unknown");

const createMap = (mapId: string): L.Map => {
  const map = L.map(mapId, {
    center: [0, 0],
    zoom: 2,
    zoomControl: true,
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map);

  return map;
};

const getStyle = (color: string) => {
  return {
    color: color,
    weight: 3,
    opacity: 0.8,
    fillColor: color,
    fillOpacity: 0.3,
  };
};

const addGeometryToMap = (map: L.Map, geometry: any, color: string): L.Layer | null => {
  if (!geometry) return null;

  try {
    const geojson = {
      type: "Feature",
      geometry: geometry,
      properties: {},
    };

    const layer = L.geoJSON(geojson as any, {
      style: () => getStyle(color),
      pointToLayer: (feature, latlng) => {
        return L.circleMarker(latlng, {
          radius: 8,
          fillColor: color,
          color: color,
          weight: 2,
          opacity: 0.8,
          fillOpacity: 0.6,
        });
      },
    }).addTo(map);

    // Fit bounds to the layer
    const bounds = layer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [30, 30] });
    }

    return layer;
  } catch (error) {
    console.error("Error adding geometry to map:", error);
    return null;
  }
};

const syncMaps = () => {
  if (!mainMap || !branchMap) return;

  mainMap.on("moveend", () => {
    if (branchMap && mainMap) {
      const center = mainMap.getCenter();
      const zoom = mainMap.getZoom();
      branchMap.setView(center, zoom, { animate: false });
    }
  });

  branchMap.on("moveend", () => {
    if (mainMap && branchMap) {
      const center = branchMap.getCenter();
      const zoom = branchMap.getZoom();
      mainMap.setView(center, zoom, { animate: false });
    }
  });
};

onMounted(() => {
  // Create maps
  mainMap = createMap(mainMapId.value);
  branchMap = createMap(branchMapId.value);

  // Add geometries
  if (props.mainGeometry) {
    mainLayer = addGeometryToMap(mainMap, props.mainGeometry, "#3b82f6");
  }

  if (props.branchGeometry) {
    branchLayer = addGeometryToMap(branchMap, props.branchGeometry, "#10b981");
  }

  // Synchronize map views
  syncMaps();

  // Invalidate size after mount to ensure proper rendering
  setTimeout(() => {
    mainMap?.invalidateSize();
    branchMap?.invalidateSize();
  }, 100);
});

onBeforeUnmount(() => {
  if (mainLayer && mainMap) {
    mainMap.removeLayer(mainLayer);
  }
  if (branchLayer && branchMap) {
    branchMap.removeLayer(branchLayer);
  }
  if (mainMap) {
    mainMap.remove();
  }
  if (branchMap) {
    branchMap.remove();
  }
});
</script>

<template>
  <div>
    <div
      :id="mapId"
      :style="{ height: `${height}px` }"
      class="rounded-lg border-2 border-gray-300"
    ></div>
    <div class="mt-2 text-sm text-gray-600">
      <p v-if="tool === 'point'">Click on the map to place a point</p>
      <p v-else-if="tool === 'line'">
        Click to add points, double-click to finish
      </p>
      <p v-else-if="tool === 'polygon'">
        Click to add points, double-click to close polygon
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onBeforeUnmount } from "vue";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface Props {
  height?: number;
  tool?: "point" | "line" | "polygon";
}

const props = withDefaults(defineProps<Props>(), {
  height: 400,
  tool: "point",
});

const emit = defineEmits<{
  featureCreated: [geometry: any];
}>();

const mapId = ref(`map-editor-${Math.random().toString(36).substr(2, 9)}`);
let map: L.Map | null = null;
let drawnLayer: L.LayerGroup | null = null;
let currentDrawing: L.LatLng[] = [];
let tempPolyline: L.Polyline | null = null;

const initMap = () => {
  map = L.map(mapId.value).setView([37.7749, -122.4194], 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(map);

  drawnLayer = L.layerGroup().addTo(map);

  setupDrawingHandlers();
};

const setupDrawingHandlers = () => {
  if (!map) return;

  map.on("click", (e: L.LeafletMouseEvent) => {
    handleMapClick(e.latlng);
  });

  map.on("dblclick", (e: L.LeafletMouseEvent) => {
    L.DomEvent.stop(e);
    finishDrawing();
  });
};

const handleMapClick = (latlng: L.LatLng) => {
  if (!map || !drawnLayer) return;

  currentDrawing.push(latlng);

  switch (props.tool) {
    case "point":
      const marker = L.circleMarker(latlng, {
        radius: 8,
        fillColor: "#3b82f6",
        color: "#ffffff",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.7,
      });
      drawnLayer.addLayer(marker);

      emit("featureCreated", {
        type: "Point",
        coordinates: [latlng.lng, latlng.lat],
      });

      currentDrawing = [];
      break;

    case "line":
      // Show temporary line while drawing
      if (tempPolyline) {
        map.removeLayer(tempPolyline);
      }
      if (currentDrawing.length > 1) {
        tempPolyline = L.polyline(currentDrawing, {
          color: "#3b82f6",
          weight: 3,
          opacity: 0.7,
          dashArray: "5, 10",
        }).addTo(map);
      }

      // Add point marker
      const lineMarker = L.circleMarker(latlng, {
        radius: 5,
        fillColor: "#3b82f6",
        color: "#ffffff",
        weight: 2,
        opacity: 1,
        fillOpacity: 1,
      });
      drawnLayer.addLayer(lineMarker);
      break;

    case "polygon":
      // Show temporary polygon while drawing
      if (tempPolyline) {
        map.removeLayer(tempPolyline);
      }
      if (currentDrawing.length > 1) {
        tempPolyline = L.polyline(currentDrawing, {
          color: "#3b82f6",
          weight: 3,
          opacity: 0.7,
          dashArray: "5, 10",
        }).addTo(map);
      }

      // Add point marker
      const polygonMarker = L.circleMarker(latlng, {
        radius: 5,
        fillColor: "#3b82f6",
        color: "#ffffff",
        weight: 2,
        opacity: 1,
        fillOpacity: 1,
      });
      drawnLayer.addLayer(polygonMarker);
      break;
  }
};

const finishDrawing = () => {
  if (!map || !drawnLayer) return;

  if (currentDrawing.length < 2) {
    currentDrawing = [];
    return;
  }

  // Remove temporary drawing
  if (tempPolyline) {
    map.removeLayer(tempPolyline);
    tempPolyline = null;
  }

  switch (props.tool) {
    case "line":
      if (currentDrawing.length >= 2) {
        const polyline = L.polyline(currentDrawing, {
          color: "#3b82f6",
          weight: 3,
          opacity: 0.7,
        });
        drawnLayer.addLayer(polyline);

        emit("featureCreated", {
          type: "LineString",
          coordinates: currentDrawing.map((p) => [p.lng, p.lat]),
        });
      }
      break;

    case "polygon":
      if (currentDrawing.length >= 3) {
        // Close the polygon
        const closedDrawing = [...currentDrawing, currentDrawing[0]];
        const polygon = L.polygon(currentDrawing, {
          fillColor: "#3b82f6",
          color: "#3b82f6",
          weight: 2,
          opacity: 0.7,
          fillOpacity: 0.3,
        });
        drawnLayer.addLayer(polygon);

        emit("featureCreated", {
          type: "Polygon",
          coordinates: [closedDrawing.map((p) => [p.lng, p.lat])],
        });
      }
      break;
  }

  currentDrawing = [];
};

const clearDrawings = () => {
  if (drawnLayer) {
    drawnLayer.clearLayers();
  }
  if (tempPolyline && map) {
    map.removeLayer(tempPolyline);
    tempPolyline = null;
  }
  currentDrawing = [];
};

watch(
  () => props.tool,
  () => {
    clearDrawings();
  }
);

onMounted(() => {
  initMap();
});

onBeforeUnmount(() => {
  if (map) {
    map.remove();
  }
});

defineExpose({
  clearDrawings,
});
</script>

<style scoped>
:deep(.leaflet-container) {
  cursor: crosshair;
}
</style>

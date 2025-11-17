<template>
  <div>
    <div
      :id="mapId"
      :style="{ height: `${height}px` }"
      class="rounded-lg border-2 border-gray-300"
    ></div>
    <div class="mt-2 flex items-center justify-between text-sm">
      <div class="text-gray-600">
        <p v-if="tool === 'point'">Click on the map to place a point</p>
        <p v-else-if="tool === 'line'">
          Click to add points, double-click to finish
        </p>
        <p v-else-if="tool === 'polygon'">
          Click to add points, double-click to close polygon
        </p>
        <p v-else-if="tool === 'select'">
          Click feature to select, then click "Edit Geometry" to modify shape
        </p>
        <p v-else-if="tool === 'edit'">
          <span class="font-semibold text-blue-600"
            >EDIT MODE: Drag markers to reshape geometry</span
          >
        </p>
      </div>
      <div v-if="editingFeature && tool === 'select'" class="flex space-x-2">
        <button
          @click="startEditingGeometry"
          class="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
        >
          ✏️ Edit Geometry
        </button>
      </div>
      <div v-if="tool === 'edit'" class="flex space-x-2">
        <button
          @click="saveGeometryChanges"
          class="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
        >
          ✓ Save Changes
        </button>
        <button
          @click="cancelGeometryEdit"
          class="px-3 py-1 bg-gray-600 text-white rounded text-xs hover:bg-gray-700"
        >
          ✕ Cancel
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onBeforeUnmount } from "vue";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface Props {
  height?: number;
  tool?: "point" | "line" | "polygon" | "select" | "edit";
  features?: any[];
}

const props = withDefaults(defineProps<Props>(), {
  height: 400,
  tool: "point",
  features: () => [],
});

const emit = defineEmits<{
  featureCreated: [geometry: any];
  featureDeleted: [index: number];
  featureSelected: [index: number];
  geometryUpdated: [index: number, newGeometry: any];
  toolChange: [tool: string];
}>();

const mapId = ref(`map-editor-${Math.random().toString(36).substr(2, 9)}`);
let map: L.Map | null = null;
let drawnLayer: L.LayerGroup | null = null;
let permanentLayer: L.LayerGroup | null = null;
let editLayer: L.LayerGroup | null = null;
let currentDrawing: L.LatLng[] = [];
let tempPolyline: L.Polyline | null = null;
let selectedFeatureIndex: number | null = null;
let editingFeature = ref<any | null>(null);
let editableLayer: L.Layer | null = null;
let editMarkers: L.Marker[] = [];

const initMap = () => {
  map = L.map(mapId.value).setView([37.7749, -122.4194], 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(map);

  permanentLayer = L.layerGroup().addTo(map);
  drawnLayer = L.layerGroup().addTo(map);
  editLayer = L.layerGroup().addTo(map);

  setupDrawingHandlers();
  setupKeyboardHandlers();
};

const setupKeyboardHandlers = () => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Delete" || e.key === "Backspace") {
      if (selectedFeatureIndex !== null && props.tool !== "edit") {
        e.preventDefault();
        emit("featureDeleted", selectedFeatureIndex);
        selectedFeatureIndex = null;
        editingFeature.value = null;
      }
    }
    if (e.key === "Escape") {
      if (props.tool === "edit") {
        cancelGeometryEdit();
      } else {
        // Cancel current drawing
        currentDrawing = [];
        clearTemporaryDrawing();
        // Deselect feature
        if (selectedFeatureIndex !== null) {
          selectedFeatureIndex = null;
          editingFeature.value = null;
          renderPermanentFeatures();
        }
      }
    }
  };

  document.addEventListener("keydown", handleKeyDown);
  (window as any)._mapEditorKeyHandler = handleKeyDown;
};

const setupDrawingHandlers = () => {
  if (!map) return;

  map.on("click", (e: L.LeafletMouseEvent) => {
    if (props.tool === "select") {
      selectedFeatureIndex = null;
      editingFeature.value = null;
      renderPermanentFeatures();
    } else if (props.tool !== "edit") {
      handleMapClick(e.latlng);
    }
  });

  map.on("dblclick", (e: L.LeafletMouseEvent) => {
    L.DomEvent.stop(e);
    if (props.tool !== "select" && props.tool !== "edit") {
      finishDrawing();
    }
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
      clearTemporaryDrawing();
      break;

    case "line":
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

  clearTemporaryDrawing();

  switch (props.tool) {
    case "line":
      if (currentDrawing.length >= 2) {
        emit("featureCreated", {
          type: "LineString",
          coordinates: currentDrawing.map((p) => [p.lng, p.lat]),
        });
      }
      break;

    case "polygon":
      if (currentDrawing.length >= 3) {
        const closedDrawing = [...currentDrawing, currentDrawing[0]];
        emit("featureCreated", {
          type: "Polygon",
          coordinates: [closedDrawing.map((p) => [p.lng, p.lat])],
        });
      }
      break;
  }

  currentDrawing = [];
};

const clearTemporaryDrawing = () => {
  if (drawnLayer) {
    drawnLayer.clearLayers();
  }
  if (tempPolyline && map) {
    map.removeLayer(tempPolyline);
    tempPolyline = null;
  }
};

const clearDrawings = () => {
  clearTemporaryDrawing();
  if (permanentLayer) {
    permanentLayer.clearLayers();
  }
  if (editLayer) {
    editLayer.clearLayers();
  }
  currentDrawing = [];
  selectedFeatureIndex = null;
  editingFeature.value = null;
  editMarkers = [];
};

const startEditingGeometry = () => {
  if (!editingFeature.value || !map || !editLayer) return;

  emit("toolChange", "edit");

  // Clear permanent layer temporarily
  permanentLayer?.clearLayers();

  const feature = editingFeature.value;
  const geometryType = feature.geometryType;

  if (geometryType === "Point") {
    const [lng, lat] = feature.geometry.coordinates;
    const marker = createDraggableMarker([lat, lng], 0);
    editLayer.addLayer(marker);
  } else if (geometryType === "LineString") {
    const coords = feature.geometry.coordinates;
    coords.forEach((coord: number[], index: number) => {
      const marker = createDraggableMarker([coord[1], coord[0]], index);
      editLayer?.addLayer(marker);
    });
    // Draw the line
    updateEditPreview();
  } else if (geometryType === "Polygon") {
    const coords = feature.geometry.coordinates[0];
    coords.slice(0, -1).forEach((coord: number[], index: number) => {
      const marker = createDraggableMarker([coord[1], coord[0]], index);
      editLayer?.addLayer(marker);
    });
    // Draw the polygon
    updateEditPreview();
  }
};

const createDraggableMarker = (latlng: L.LatLngExpression, index: number) => {
  const marker = L.marker(latlng, {
    draggable: true,
    icon: L.divIcon({
      className: "edit-marker",
      html: '<div style="background: #3b82f6; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>',
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    }),
  });

  marker.on("drag", () => {
    updateEditPreview();
  });

  editMarkers[index] = marker;
  return marker;
};

const updateEditPreview = () => {
  if (!map || !editingFeature.value) return;

  // Remove old preview
  editLayer?.eachLayer((layer) => {
    if (layer instanceof L.Polyline || layer instanceof L.Polygon) {
      editLayer?.removeLayer(layer);
    }
  });

  const positions = editMarkers.map((m) => m.getLatLng());

  if (editingFeature.value.geometryType === "LineString") {
    const line = L.polyline(positions, {
      color: "#3b82f6",
      weight: 3,
      opacity: 0.7,
    });
    editLayer?.addLayer(line);
  } else if (editingFeature.value.geometryType === "Polygon") {
    const polygon = L.polygon(positions, {
      fillColor: "#3b82f6",
      color: "#3b82f6",
      weight: 2,
      opacity: 0.7,
      fillOpacity: 0.3,
    });
    editLayer?.addLayer(polygon);
  }
};

const saveGeometryChanges = () => {
  if (!editingFeature.value || selectedFeatureIndex === null) return;

  let newGeometry: any;

  if (editingFeature.value.geometryType === "Point") {
    const latlng = editMarkers[0].getLatLng();
    newGeometry = {
      type: "Point",
      coordinates: [latlng.lng, latlng.lat],
    };
  } else if (editingFeature.value.geometryType === "LineString") {
    const coordinates = editMarkers.map((m) => {
      const latlng = m.getLatLng();
      return [latlng.lng, latlng.lat];
    });
    newGeometry = {
      type: "LineString",
      coordinates,
    };
  } else if (editingFeature.value.geometryType === "Polygon") {
    const coordinates = editMarkers.map((m) => {
      const latlng = m.getLatLng();
      return [latlng.lng, latlng.lat];
    });
    // Close the polygon
    coordinates.push(coordinates[0]);
    newGeometry = {
      type: "Polygon",
      coordinates: [coordinates],
    };
  }

  emit("geometryUpdated", selectedFeatureIndex, newGeometry);
  cancelGeometryEdit();
};

const cancelGeometryEdit = () => {
  editLayer?.clearLayers();
  editMarkers = [];
  editingFeature.value = null;
  emit("toolChange", "select");
  renderPermanentFeatures();
};

const getFeatureColor = (feature: any, isSelected: boolean) => {
  if (isSelected) return "#3b82f6";

  switch (feature.operation) {
    case "create":
      return "#10b981";
    case "update":
      return "#f59e0b";
    case "delete":
      return "#ef4444";
    default:
      return "#6b7280";
  }
};

const renderPermanentFeatures = () => {
  if (!permanentLayer || !map) return;
  if (props.tool === "edit") return; // Don't render during edit

  permanentLayer.clearLayers();

  props.features.forEach((feature, index) => {
    let layer: L.Layer | null = null;
    const isSelected = index === selectedFeatureIndex;
    const color = getFeatureColor(feature, isSelected);
    const opacity = feature.operation === "delete" ? 0.4 : 0.7;
    const weight = isSelected ? 4 : 2;

    try {
      switch (feature.geometryType) {
        case "Point":
          const [lng, lat] = feature.geometry.coordinates;
          layer = L.circleMarker([lat, lng], {
            radius: isSelected ? 10 : 8,
            fillColor: color,
            color: "#ffffff",
            weight: weight,
            opacity: 1,
            fillOpacity: opacity,
          });
          break;

        case "Line":
        case "LineString":
          const lineCoords = feature.geometry.coordinates.map(
            (c: number[]) => [c[1], c[0]] as L.LatLngExpression
          );
          layer = L.polyline(lineCoords, {
            color: color,
            weight: isSelected ? 5 : 3,
            opacity: opacity,
          });
          break;

        case "Polygon":
          const polygonCoords = feature.geometry.coordinates[0].map(
            (c: number[]) => [c[1], c[0]] as L.LatLngExpression
          );
          layer = L.polygon(polygonCoords, {
            fillColor: color,
            color: color,
            weight: weight,
            opacity: opacity,
            fillOpacity: opacity * 0.5,
          });
          break;
      }

      if (layer) {
        layer.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          if (props.tool === "select") {
            selectedFeatureIndex = index;
            editingFeature.value = feature;
            emit("featureSelected", index);
            renderPermanentFeatures();
          }
        });

        const operationLabel = feature.operation || "existing";
        const popupContent = `
          <div class="p-2">
            <p class="font-semibold">${feature.geometryType}</p>
            <p class="text-sm text-gray-600">Status: ${operationLabel.toUpperCase()}</p>
            ${feature.featureId ? `<p class="text-xs text-gray-500 mt-1">ID: ${feature.featureId.substring(0, 8)}...</p>` : ""}
            ${isSelected ? '<p class="text-sm text-blue-600 mt-2">✓ Selected - Click "Edit Geometry" to modify</p>' : '<p class="text-sm text-gray-500 mt-2">Click to select</p>'}
          </div>
        `;
        layer.bindPopup(popupContent);

        layer.on("mouseover", function () {
          if (map && props.tool === "select") {
            (map as any).getContainer().style.cursor = "pointer";
          }
        });
        layer.on("mouseout", function () {
          if (map) {
            (map as any).getContainer().style.cursor =
              props.tool === "select" ? "default" : "crosshair";
          }
        });

        permanentLayer?.addLayer(layer);
      }
    } catch (error) {
      console.error("Error rendering feature:", error);
    }
  });

  // Auto-fit bounds
  if (
    props.features.length > 0 &&
    props.features.some((f) => f.operation !== "delete")
  ) {
    try {
      const visibleFeatures = props.features.filter(
        (f) => f.operation !== "delete"
      );
      if (visibleFeatures.length > 0) {
        const bounds: L.LatLngBounds[] = [];

        visibleFeatures.forEach((feature) => {
          try {
            if (feature.geometryType === "Point") {
              const [lng, lat] = feature.geometry.coordinates;
              bounds.push(L.latLngBounds([lat, lng], [lat, lng]));
            } else if (feature.geometryType === "LineString") {
              const coords = feature.geometry.coordinates.map(
                (c: number[]) => [c[1], c[0]] as L.LatLngExpression
              );
              const polyline = L.polyline(coords);
              bounds.push(polyline.getBounds());
            } else if (feature.geometryType === "Polygon") {
              const coords = feature.geometry.coordinates[0].map(
                (c: number[]) => [c[1], c[0]] as L.LatLngExpression
              );
              const polygon = L.polygon(coords);
              bounds.push(polygon.getBounds());
            }
          } catch (e) {
            // Skip problematic features
          }
        });

        if (bounds.length > 0) {
          const combinedBounds = bounds.reduce((acc, b) => acc.extend(b));
          map.fitBounds(combinedBounds, { padding: [50, 50], maxZoom: 15 });
        }
      }
    } catch (e) {
      // Ignore errors
    }
  }
};

watch(
  () => props.tool,
  (newTool) => {
    clearTemporaryDrawing();
    currentDrawing = [];

    if (newTool !== "select" && newTool !== "edit") {
      selectedFeatureIndex = null;
      editingFeature.value = null;
    }

    if (newTool !== "edit") {
      editLayer?.clearLayers();
      editMarkers = [];
    }

    renderPermanentFeatures();

    if (map) {
      (map as any).getContainer().style.cursor =
        newTool === "select" || newTool === "edit" ? "default" : "crosshair";
    }
  }
);

watch(
  () => props.features,
  () => {
    if (props.tool !== "edit") {
      renderPermanentFeatures();
    }
  },
  { deep: true }
);

onMounted(() => {
  initMap();
  renderPermanentFeatures();
});

onBeforeUnmount(() => {
  const handler = (window as any)._mapEditorKeyHandler;
  if (handler) {
    document.removeEventListener("keydown", handler);
    delete (window as any)._mapEditorKeyHandler;
  }

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

:deep(.edit-marker) {
  cursor: move !important;
}
</style>

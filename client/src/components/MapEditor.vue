<template>
  <div>
    <div
      :id="mapId"
      :style="{ height: `${height}px`, cursor: mapCursor }"
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
import { ref, onMounted, watch, onBeforeUnmount, computed } from "vue";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

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
let map: maplibregl.Map | null = null;
let currentDrawing: [number, number][] = [];
let selectedFeatureIndex: number | null = null;
let editingFeature = ref<any | null>(null);
let editMarkers: maplibregl.Marker[] = [];
let tempMarkers: maplibregl.Marker[] = [];
let currentPopup: maplibregl.Popup | null = null;

const mapCursor = computed(() => {
  if (props.tool === "select" || props.tool === "edit") return "default";
  return "crosshair";
});

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
        currentDrawing = [];
        clearTemporaryDrawing();
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

  let clickTimeout: any = null;
  let clickCount = 0;

  map.on("click", (e: maplibregl.MapMouseEvent) => {
    clickCount++;

    if (clickCount === 1) {
      clickTimeout = setTimeout(() => {
        // Single click
        if (props.tool === "select") {
          handleSelectClick(e);
        } else if (props.tool !== "edit") {
          handleMapClick([e.lngLat.lng, e.lngLat.lat]);
        }
        clickCount = 0;
      }, 300);
    } else if (clickCount === 2) {
      // Double click
      clearTimeout(clickTimeout);
      if (props.tool !== "select" && props.tool !== "edit") {
        finishDrawing();
      }
      clickCount = 0;
    }
  });
};

const handleSelectClick = (e: maplibregl.MapMouseEvent) => {
  const features = map!.queryRenderedFeatures(e.point, {
    layers: ["features-fill", "features-line", "features-point"],
  });

  if (features && features.length > 0) {
    const clickedFeature = features[0];
    const featureIndex = props.features.findIndex(
      (f) => f.id === clickedFeature.properties?.featureId
    );

    if (featureIndex !== -1) {
      selectedFeatureIndex = featureIndex;
      editingFeature.value = props.features[featureIndex];
      emit("featureSelected", featureIndex);
      renderPermanentFeatures();

      // Show popup
      const feature = props.features[featureIndex];
      const operationLabel = feature.operation || "existing";
      const popupContent = `
        <div class="p-2">
          <p class="font-semibold">${feature.geometryType}</p>
          <p class="text-sm text-gray-600">Status: ${operationLabel.toUpperCase()}</p>
          ${feature.id ? `<p class="text-xs text-gray-500 mt-1">ID: ${feature.id.substring(0, 8)}...</p>` : ""}
          <p class="text-sm text-blue-600 mt-2">✓ Selected - Click "Edit Geometry" to modify</p>
        </div>
      `;

      if (currentPopup) {
        currentPopup.remove();
      }

      currentPopup = new maplibregl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(popupContent)
        .addTo(map!);
    }
  } else {
    selectedFeatureIndex = null;
    editingFeature.value = null;
    if (currentPopup) {
      currentPopup.remove();
      currentPopup = null;
    }
    renderPermanentFeatures();
  }
};

const handleMapClick = (lnglat: [number, number]) => {
  if (!map) return;

  currentDrawing.push(lnglat);

  // Add temporary marker
  const markerEl = document.createElement("div");
  markerEl.style.width = "10px";
  markerEl.style.height = "10px";
  markerEl.style.borderRadius = "50%";
  markerEl.style.backgroundColor = "#3b82f6";
  markerEl.style.border = "2px solid white";
  markerEl.style.boxShadow = "0 0 4px rgba(0,0,0,0.5)";

  const marker = new maplibregl.Marker({ element: markerEl })
    .setLngLat(lnglat)
    .addTo(map);

  tempMarkers.push(marker);

  switch (props.tool) {
    case "point":
      emit("featureCreated", {
        type: "Point",
        coordinates: lnglat,
      });
      currentDrawing = [];
      clearTemporaryDrawing();
      break;

    case "line":
    case "polygon":
      if (currentDrawing.length > 1) {
        updateTemporaryLine();
      }
      break;
  }
};

const updateTemporaryLine = () => {
  if (!map) return;

  // Remove existing temporary line
  if (map.getSource("temp-line")) {
    if (map.getLayer("temp-line")) {
      map.removeLayer("temp-line");
    }
    map.removeSource("temp-line");
  }

  // Add new temporary line
  const geojson: any = {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: currentDrawing,
    },
  };

  map.addSource("temp-line", {
    type: "geojson",
    data: geojson,
  });

  map.addLayer({
    id: "temp-line",
    type: "line",
    source: "temp-line",
    paint: {
      "line-color": "#3b82f6",
      "line-width": 3,
      "line-opacity": 0.7,
      "line-dasharray": [2, 2],
    },
  });
};

const finishDrawing = () => {
  if (!map) return;

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
          coordinates: currentDrawing,
        });
      }
      break;

    case "polygon":
      if (currentDrawing.length >= 3) {
        const closedDrawing = [...currentDrawing, currentDrawing[0]];
        emit("featureCreated", {
          type: "Polygon",
          coordinates: [closedDrawing],
        });
      }
      break;
  }

  currentDrawing = [];
};

const clearTemporaryDrawing = () => {
  tempMarkers.forEach((marker) => marker.remove());
  tempMarkers = [];

  if (map && map.getSource("temp-line")) {
    if (map.getLayer("temp-line")) {
      map.removeLayer("temp-line");
    }
    map.removeSource("temp-line");
  }
};

const clearDrawings = () => {
  clearTemporaryDrawing();
  editMarkers.forEach((marker) => marker.remove());
  editMarkers = [];
  currentDrawing = [];
  selectedFeatureIndex = null;
  editingFeature.value = null;
  if (currentPopup) {
    currentPopup.remove();
    currentPopup = null;
  }
  renderPermanentFeatures();
};

const startEditingGeometry = () => {
  if (!editingFeature.value || !map) return;

  emit("toolChange", "edit");

  const feature = editingFeature.value;
  const geometryType = feature.geometryType;

  if (geometryType === "Point") {
    const [lng, lat] = feature.geometry.coordinates;
    const marker = createDraggableMarker([lng, lat], 0);
    editMarkers.push(marker);
  } else if (geometryType === "LineString" || geometryType === "Line") {
    const coords = feature.geometry.coordinates;
    coords.forEach((coord: number[], index: number) => {
      const marker = createDraggableMarker([coord[0], coord[1]], index);
      editMarkers.push(marker);
    });
    updateEditPreview();
  } else if (geometryType === "Polygon") {
    const coords = feature.geometry.coordinates[0];
    coords.slice(0, -1).forEach((coord: number[], index: number) => {
      const marker = createDraggableMarker([coord[0], coord[1]], index);
      editMarkers.push(marker);
    });
    updateEditPreview();
  }

  // Hide permanent features during edit
  renderPermanentFeatures();
};

const createDraggableMarker = (
  lnglat: [number, number],
  _index: number
): maplibregl.Marker => {
  const markerEl = document.createElement("div");
  markerEl.style.width = "12px";
  markerEl.style.height = "12px";
  markerEl.style.borderRadius = "50%";
  markerEl.style.backgroundColor = "#3b82f6";
  markerEl.style.border = "2px solid white";
  markerEl.style.boxShadow = "0 0 4px rgba(0,0,0,0.5)";
  markerEl.style.cursor = "move";

  const marker = new maplibregl.Marker({
    element: markerEl,
    draggable: true,
  })
    .setLngLat(lnglat)
    .addTo(map!);

  marker.on("drag", () => {
    updateEditPreview();
  });

  return marker;
};

const updateEditPreview = () => {
  if (!map || !editingFeature.value) return;

  // Remove existing edit preview
  if (map.getSource("edit-preview")) {
    ["edit-preview-fill", "edit-preview-line"].forEach((layerId) => {
      if (map!.getLayer(layerId)) {
        map!.removeLayer(layerId);
      }
    });
    map.removeSource("edit-preview");
  }

  const positions = editMarkers.map((m) => m.getLngLat());
  const coordinates = positions.map((p) => [p.lng, p.lat]);
  const geometryType = editingFeature.value.geometryType;

  let geojson: any;

  if (geometryType === "LineString" || geometryType === "Line") {
    geojson = {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates,
      },
    };

    map.addSource("edit-preview", {
      type: "geojson",
      data: geojson,
    });

    map.addLayer({
      id: "edit-preview-line",
      type: "line",
      source: "edit-preview",
      paint: {
        "line-color": "#3b82f6",
        "line-width": 3,
        "line-opacity": 0.7,
      },
    });
  } else if (geometryType === "Polygon") {
    geojson = {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [coordinates],
      },
    };

    map.addSource("edit-preview", {
      type: "geojson",
      data: geojson,
    });

    map.addLayer({
      id: "edit-preview-fill",
      type: "fill",
      source: "edit-preview",
      paint: {
        "fill-color": "#3b82f6",
        "fill-opacity": 0.3,
      },
    });

    map.addLayer({
      id: "edit-preview-line",
      type: "line",
      source: "edit-preview",
      paint: {
        "line-color": "#3b82f6",
        "line-width": 2,
        "line-opacity": 0.7,
      },
    });
  }
};

const saveGeometryChanges = () => {
  if (!editingFeature.value || selectedFeatureIndex === null) return;

  let newGeometry: any;
  const geometryType = editingFeature.value.geometryType;

  if (geometryType === "Point") {
    const lnglat = editMarkers[0].getLngLat();
    newGeometry = {
      type: "Point",
      coordinates: [lnglat.lng, lnglat.lat],
    };
  } else if (geometryType === "LineString" || geometryType === "Line") {
    const coordinates = editMarkers.map((m) => {
      const lnglat = m.getLngLat();
      return [lnglat.lng, lnglat.lat];
    });
    newGeometry = {
      type: "LineString",
      coordinates,
    };
  } else if (geometryType === "Polygon") {
    const coordinates = editMarkers.map((m) => {
      const lnglat = m.getLngLat();
      return [lnglat.lng, lnglat.lat];
    });
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
  editMarkers.forEach((marker) => marker.remove());
  editMarkers = [];

  // Remove edit preview
  if (map && map.getSource("edit-preview")) {
    ["edit-preview-fill", "edit-preview-line"].forEach((layerId) => {
      if (map!.getLayer(layerId)) {
        map!.removeLayer(layerId);
      }
    });
    map.removeSource("edit-preview");
  }

  editingFeature.value = null;
  selectedFeatureIndex = null;
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

  if (props.tool === "edit" || props.features.length === 0) return;

  // Convert features to GeoJSON
  const geojson = {
    type: "FeatureCollection",
    features: props.features.map((feature, index) => {
      const isSelected = index === selectedFeatureIndex;
      const color = getFeatureColor(feature, isSelected);
      const opacity = feature.operation === "delete" ? 0.4 : 0.7;

      return {
        type: "Feature",
        id: feature.id,
        geometry: {
          type:
            feature.geometryType === "Line"
              ? "LineString"
              : feature.geometryType,
          coordinates: feature.geometry.coordinates,
        },
        properties: {
          ...feature.properties,
          color,
          opacity,
          isSelected,
          index,
          operation: feature.operation,
          geometryType: feature.geometryType,
          featureId: feature.id,
        },
      };
    }),
  };

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
      "fill-opacity": [
        "*",
        ["get", "opacity"],
        0.5,
      ],
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
      "line-color": ["get", "color"],
      "line-width": [
        "case",
        ["get", "isSelected"],
        5,
        3,
      ],
      "line-opacity": ["get", "opacity"],
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
        ["get", "isSelected"],
        10,
        8,
      ],
      "circle-color": ["get", "color"],
      "circle-opacity": ["get", "opacity"],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": [
        "case",
        ["get", "isSelected"],
        4,
        2,
      ],
    },
  });

  // Change cursor on hover for select tool
  if (props.tool === "select") {
    ["features-fill", "features-line", "features-point"].forEach((layerId) => {
      map!.on("mouseenter", layerId, () => {
        map!.getCanvas().style.cursor = "pointer";
      });

      map!.on("mouseleave", layerId, () => {
        map!.getCanvas().style.cursor = "";
      });
    });
  }

  // Auto-fit bounds
  if (props.features.length > 0) {
    const visibleFeatures = props.features.filter(
      (f) => f.operation !== "delete"
    );

    if (visibleFeatures.length > 0) {
      const coordinates = visibleFeatures.flatMap((feature) => {
        const coords = feature.geometry.coordinates;
        switch (feature.geometryType) {
          case "Point":
            return [coords as [number, number]];
          case "LineString":
          case "Line":
            return coords as [number, number][];
          case "Polygon":
            return coords[0] as [number, number][];
          default:
            return [];
        }
      });

      if (coordinates.length > 0) {
        const bounds = coordinates.reduce(
          (bounds, coord) => bounds.extend(coord as [number, number]),
          new maplibregl.LngLatBounds(coordinates[0], coordinates[0])
        );

        map.fitBounds(bounds, {
          padding: 50,
          maxZoom: 15,
        });
      }
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
      if (currentPopup) {
        currentPopup.remove();
        currentPopup = null;
      }
    }

    if (newTool !== "edit") {
      editMarkers.forEach((marker) => marker.remove());
      editMarkers = [];

      if (map && map.getSource("edit-preview")) {
        ["edit-preview-fill", "edit-preview-line"].forEach((layerId) => {
          if (map!.getLayer(layerId)) {
            map!.removeLayer(layerId);
          }
        });
        map.removeSource("edit-preview");
      }
    }

    renderPermanentFeatures();
  }
);

watch(
  () => props.features,
  () => {
    if (props.tool !== "edit" && map && map.loaded()) {
      renderPermanentFeatures();
    }
  },
  { deep: true }
);

onMounted(() => {
  initMap();
  map!.on("load", () => {
    renderPermanentFeatures();
  });
});

onBeforeUnmount(() => {
  const handler = (window as any)._mapEditorKeyHandler;
  if (handler) {
    document.removeEventListener("keydown", handler);
    delete (window as any)._mapEditorKeyHandler;
  }

  tempMarkers.forEach((marker) => marker.remove());
  editMarkers.forEach((marker) => marker.remove());

  if (currentPopup) {
    currentPopup.remove();
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
/* MapLibre GL popup styles */
:deep(.maplibregl-popup) {
  z-index: 10;
}

:deep(.maplibregl-popup-content) {
  padding: 0;
  font-family: inherit;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  max-width: 300px;
  min-width: 200px;
}

:deep(.maplibregl-popup-close-button) {
  font-size: 18px;
  padding: 8px;
  color: #6b7280;
  right: 4px;
  top: 4px;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  transition: all 0.2s;
}

:deep(.maplibregl-popup-close-button):hover {
  background-color: #f3f4f6;
  color: #374151;
}

:deep(.maplibregl-popup-tip) {
  border-top-color: white;
}

:deep(.maplibregl-popup-content .p-2) {
  padding: 12px;
}

:deep(.maplibregl-popup-content .font-semibold) {
  color: #111827;
  font-size: 16px;
  margin-bottom: 8px;
}

:deep(.maplibregl-popup-content .text-sm) {
  font-size: 13px;
  margin-bottom: 4px;
  color: #4b5563;
}

:deep(.maplibregl-popup-content .text-gray-600) {
  color: #6b7280;
}

:deep(.maplibregl-popup-content .text-blue-600) {
  color: #2563eb;
}

:deep(.maplibregl-popup-content .font-medium) {
  font-weight: 500;
  color: #111827;
}

:deep(.maplibregl-popup-content .text-xs) {
  font-size: 11px;
}

:deep(.maplibregl-popup-content .text-gray-500) {
  color: #6b7280;
}
</style>

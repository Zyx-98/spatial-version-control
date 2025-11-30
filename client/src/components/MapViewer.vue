<template>
  <div :id="mapId" :style="{ height: `${height}px` }" class="rounded-lg"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from "vue";
import maplibregl from "maplibre-gl";
import type { SpatialFeature } from "@/types";
import { useMvtLayer } from "@/composables/useMvtLayer";
import "maplibre-gl/dist/maplibre-gl.css";

interface Props {
  branchId?: string;
  features?: SpatialFeature[];
  height?: number;
  color?: string;
}

const props = withDefaults(defineProps<Props>(), {
  height: 400,
  color: "#3b82f6",
});

const mapId = ref(`map-${Math.random().toString(36).substr(2, 9)}`);
let map: maplibregl.Map | null = null;

// MVT composable
const { addBranchMvtLayer, removeMvtLayer, fitBranchBounds } = useMvtLayer();

// Prefer MVT when branchId is available
const useMvt = computed(() => !!props.branchId);

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

  // Add error handler
  map.on("error", (e) => {
    console.error("MapLibre error:", e);
  });

  // Add navigation controls
  map.addControl(new maplibregl.NavigationControl(), 'top-right');
};

const renderGeoJSON = () => {
  if (!map || !props.features || props.features.length === 0) return;

  const geojson = {
    type: "FeatureCollection" as const,
    features: props.features.map((f) => ({
      type: "Feature" as const,
      geometry: { type: f.geometryType, coordinates: f.geometry.coordinates },
      properties: { ...f.properties, color: props.color, featureId: f.id },
    })),
  };

  // Remove existing layers if they exist
  ["features-fill", "features-line", "features-point"].forEach((layerId) => {
    if (map!.getLayer(layerId)) {
      map!.removeLayer(layerId);
    }
  });
  if (map.getSource("features")) {
    map.removeSource("features");
  }

  map.addSource("features", { type: "geojson", data: geojson as any });

  map.addLayer({
    id: "features-fill",
    type: "fill",
    source: "features",
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: { "fill-color": props.color, "fill-opacity": 0.3 },
  });

  map.addLayer({
    id: "features-line",
    type: "line",
    source: "features",
    filter: ["any", ["==", ["geometry-type"], "LineString"], ["==", ["geometry-type"], "Polygon"]],
    paint: { "line-color": props.color, "line-width": 2 },
  });

  map.addLayer({
    id: "features-point",
    type: "circle",
    source: "features",
    filter: ["==", ["geometry-type"], "Point"],
    paint: {
      "circle-radius": 6,
      "circle-color": props.color,
      "circle-stroke-color": "#fff",
      "circle-stroke-width": 2,
    },
  });

  // Fit bounds
  const coords = props.features.flatMap(f => {
    const c = f.geometry.coordinates;
    if (f.geometryType === "Point") return [c as [number, number]];
    if (f.geometryType === "LineString") return c as [number, number][];
    if (f.geometryType === "Polygon") return c[0] as [number, number][];
    return [];
  });

  if (coords.length > 0) {
    const bounds = coords.reduce(
      (b, c) => b.extend(c),
      new maplibregl.LngLatBounds(coords[0], coords[0])
    );
    map.fitBounds(bounds, { padding: 50 });
  }

  // Add click handlers for GeoJSON layers
  setupGeoJSONInteractions();
};

const setupGeoJSONInteractions = () => {
  if (!map) {
    console.warn('[MapViewer] No map instance for interactions');
    return;
  }

  const layerIds = ["features-fill", "features-line", "features-point"];
  const currentMap = map; // Capture map reference

  layerIds.forEach((layerId) => {
    // Check if layer exists
    const layer = currentMap.getLayer(layerId);
    if (!layer) {
      console.warn(`[MapViewer] Layer ${layerId} not found in style`);
      return;
    }

    // Cursor on hover
    currentMap.on("mouseenter", layerId, () => {
      currentMap.getCanvas().style.cursor = "pointer";
    });

    currentMap.on("mouseleave", layerId, () => {
      currentMap.getCanvas().style.cursor = "";
    });

    // Click to show popup
    currentMap.on("click", layerId, (e) => {
      if (!e.features || e.features.length === 0) return;

      const feature = e.features[0];
      const props = feature.properties || {};

      let content = `
        <div style="font-family: sans-serif; padding: 12px;">
          <div style="font-weight: bold; font-size: 14px; margin-bottom: 8px; color: #1f2937;">
            ${feature.geometry?.type || "Feature"}
          </div>
      `;

      // Add custom properties
      const propEntries = Object.entries(props).filter(([key]) => !["color", "featureId"].includes(key));
      if (propEntries.length > 0) {
        propEntries.forEach(([key, value]) => {
          content += `
            <div style="font-size: 12px; margin-bottom: 4px; color: #4b5563;">
              <strong>${key}:</strong> ${value}
            </div>
          `;
        });
      }

      content += '</div>';

      new maplibregl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(content)
        .addTo(currentMap);
    });
  });
};

onMounted(() => {
  initMap();

  if (map) {
    map.on("load", () => {
      if (useMvt.value && props.branchId) {
        // Render MVT tiles for large datasets
        addBranchMvtLayer(map!, props.branchId, {
          sourceId: `branch-${props.branchId}`,
          color: props.color,
        });
        fitBranchBounds(map!, props.branchId);
      } else if (props.features) {
        // Render GeoJSON for small feature sets
        renderGeoJSON();
      } else {
        console.warn('[MapViewer] No data to render - no branchId or features');
      }
    });
  }
});

onBeforeUnmount(() => {
  if (map) {
    if (useMvt.value && props.branchId) {
      removeMvtLayer(map, `branch-${props.branchId}`);
    }
    map.remove();
  }
});
</script>

<style scoped>
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

/* Popup content styling */
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

:deep(.maplibregl-popup-content .font-medium) {
  font-weight: 500;
  color: #111827;
}

:deep(.maplibregl-popup-content hr) {
  border-top: 1px solid #e5e7eb;
  margin: 8px 0;
}
</style>

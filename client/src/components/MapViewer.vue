<template>
  <div :id="mapId" :style="{ height: `${height}px` }" class="rounded-lg"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onBeforeUnmount } from "vue";
import maplibregl from "maplibre-gl";
import type { SpatialFeature } from "@/types";
import "maplibre-gl/dist/maplibre-gl.css";

interface Props {
  features: SpatialFeature[];
  height?: number;
  editable?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  height: 400,
  editable: false,
});

const emit = defineEmits<{
  featureClick: [feature: SpatialFeature];
  featureCreated: [geometry: any];
}>();

const mapId = ref(`map-${Math.random().toString(36).substr(2, 9)}`);
let map: maplibregl.Map | null = null;

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
};

const getColor = (operation: string) => {
  switch (operation) {
    case "create":
      return "#10b981"; // green
    case "update":
      return "#3b82f6"; // blue
    case "delete":
      return "#ef4444"; // red
    default:
      return "#6b7280"; // gray
  }
};

const convertToGeoJSON = (features: SpatialFeature[]) => {
  return {
    type: "FeatureCollection" as const,
    features: features.map((feature) => ({
      type: "Feature" as const,
      id: feature.id,
      geometry: {
        type: feature.geometryType,
        coordinates: feature.geometry.coordinates,
      },
      properties: {
        ...feature.properties,
        operation: feature.operation,
        color: getColor(feature.operation), // Add color property
        featureId: feature.id,
        geometryType: feature.geometryType,
      },
    })),
  };
};

const renderFeatures = () => {
  if (!map || !map.loaded()) return;

  ["features-fill", "features-line", "features-point"].forEach((layerId) => {
    if (map!.getLayer(layerId)) {
      map!.removeLayer(layerId);
    }
  });

  if (map.getSource("features")) {
    map.removeSource("features");
  }

  if (props.features.length === 0) return;

  const geojson = convertToGeoJSON(props.features);

  try {
    map.addSource("features", {
      type: "geojson",
      data: geojson,
    });
  } catch (error) {
    console.error("Error adding source:", error);
    return;
  }

  map.addLayer({
    id: "features-fill",
    type: "fill",
    source: "features",
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: {
      "fill-color": ["get", "color"],
      "fill-opacity": 0.3,
    },
  });

  map.addLayer({
    id: "features-line",
    type: "line",
    source: "features",
    filter: ["any",
      ["==", ["geometry-type"], "LineString"],
      ["==", ["geometry-type"], "Polygon"]
    ],
    paint: {
      "line-color": ["get", "color"],
      "line-width": 2,
      "line-opacity": 0.7,
    },
  });

  map.addLayer({
    id: "features-point",
    type: "circle",
    source: "features",
    filter: ["==", ["geometry-type"], "Point"],
    paint: {
      "circle-radius": 8,
      "circle-color": ["get", "color"],
      "circle-opacity": 0.7,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  });

  // Fit bounds
  if (props.features.length > 0) {
    const coordinates = props.features.flatMap((feature) => {
      const coords = feature.geometry.coordinates;
      switch (feature.geometryType) {
        case "Point":
          return [coords as [number, number]];
        case "LineString":
          return coords as [number, number][];
        case "Polygon":
          return coords[0] as [number, number][];
        case "MultiPoint":
          return coords as [number, number][];
        case "MultiLineString":
          return (coords as [number, number][][]).flat();
        case "MultiPolygon":
          return (coords as [number, number][][][]).flat(2);
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
};

watch(
  () => props.features,
  () => {
    if (map && map.loaded()) {
      renderFeatures();
    }
  },
  { deep: true }
);

onMounted(() => {
  initMap();

  if (map) {
    map.on("load", () => {
      renderFeatures();

      map!.on("click", (e) => {
        const features = map!.queryRenderedFeatures(e.point, {
          layers: ["features-fill", "features-line", "features-point"],
        });

        if (features.length > 0) {
          const clickedFeature = features[0];
          const featureData = props.features.find(
            (f) => f.id === clickedFeature.properties?.featureId
          );

          if (featureData) {
            const properties = featureData.properties || {};
            const popupContent = `
              <div class="p-2">
                <p class="font-semibold">${featureData.geometryType}</p>
                <p class="text-sm text-gray-600">ID: ${featureData.id}</p>
                <p class="text-sm">Operation: <span class="font-medium">${featureData.operation}</span></p>
                ${Object.keys(properties).length > 0 ? '<hr class="my-2"/>' : ""}
                ${Object.entries(properties)
                  .map(
                    ([key, value]) =>
                      `<p class="text-sm"><span class="font-medium">${key}:</span> ${value}</p>`
                  )
                  .join("")}
              </div>
            `;

            new maplibregl.Popup()
              .setLngLat(e.lngLat)
              .setHTML(popupContent)
              .addTo(map!);

            emit("featureClick", featureData);
          }
        }
      });

      map!.on("mousemove", (e) => {
        const features = map!.queryRenderedFeatures(e.point, {
          layers: ["features-fill", "features-line", "features-point"],
        });
        map!.getCanvas().style.cursor = features.length > 0 ? "pointer" : "";
      });
    });
  }
});

onBeforeUnmount(() => {
  if (map) {
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

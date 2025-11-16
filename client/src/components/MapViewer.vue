<template>
  <div :id="mapId" :style="{ height: `${height}px` }" class="rounded-lg"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onBeforeUnmount } from "vue";
import L from "leaflet";
import type { SpatialFeature } from "@/types";
import "leaflet/dist/leaflet.css";

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
let map: L.Map | null = null;
let featureLayer: L.LayerGroup | null = null;

const initMap = () => {
  map = L.map(mapId.value).setView([37.7749, -122.4194], 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(map);

  featureLayer = L.layerGroup().addTo(map);
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

const renderFeatures = () => {
  if (!map || !featureLayer) return;

  featureLayer.clearLayers();

  if (props.features.length === 0) return;

  const bounds: L.LatLngBounds[] = [];

  props.features.forEach((feature) => {
    if (!feature.geometry || !feature.geometry.coordinates) return;

    const color = getColor(feature.operation);
    const coords = feature.geometry.coordinates;

    let layer: L.Layer | null = null;

    try {
      switch (feature.geometryType) {
        case "Point":
          const [lng, lat] = coords;
          layer = L.circleMarker([lat, lng], {
            radius: 8,
            fillColor: color,
            color: "#ffffff",
            weight: 2,
            opacity: 1,
            fillOpacity: 0.7,
          });
          bounds.push(L.latLngBounds([lat, lng], [lat, lng]));
          break;

        case "LineString":
          const lineCoords = coords.map(
            (c: number[]) => [c[1], c[0]] as L.LatLngExpression
          );
          layer = L.polyline(lineCoords, {
            color: color,
            weight: 3,
            opacity: 0.7,
          });
          bounds.push((layer as L.Polyline).getBounds());
          break;

        case "Polygon":
          const polygonCoords = coords[0].map(
            (c: number[]) => [c[1], c[0]] as L.LatLngExpression
          );
          layer = L.polygon(polygonCoords, {
            fillColor: color,
            color: color,
            weight: 2,
            opacity: 0.7,
            fillOpacity: 0.3,
          });
          bounds.push((layer as L.Polygon).getBounds());
          break;

        case "MultiPoint":
          coords.forEach((c: number[]) => {
            const marker = L.circleMarker([c[1], c[0]], {
              radius: 8,
              fillColor: color,
              color: "#ffffff",
              weight: 2,
              opacity: 1,
              fillOpacity: 0.7,
            });
            featureLayer?.addLayer(marker);
            bounds.push(L.latLngBounds([c[1], c[0]], [c[1], c[0]]));
          });
          break;

        case "MultiLineString":
          coords.forEach((line: number[][]) => {
            const lineCoords = line.map(
              (c: number[]) => [c[1], c[0]] as L.LatLngExpression
            );
            const polyline = L.polyline(lineCoords, {
              color: color,
              weight: 3,
              opacity: 0.7,
            });
            featureLayer?.addLayer(polyline);
            bounds.push(polyline.getBounds());
          });
          break;

        case "MultiPolygon":
          coords.forEach((polygon: number[][][]) => {
            const polygonCoords = polygon[0].map(
              (c: number[]) => [c[1], c[0]] as L.LatLngExpression
            );
            const poly = L.polygon(polygonCoords, {
              fillColor: color,
              color: color,
              weight: 2,
              opacity: 0.7,
              fillOpacity: 0.3,
            });
            featureLayer?.addLayer(poly);
            bounds.push(poly.getBounds());
          });
          break;
      }

      if (layer) {
        // Add popup
        const properties = feature.properties || {};
        const popupContent = `
          <div class="p-2">
            <p class="font-semibold">${feature.geometryType}</p>
            <p class="text-sm text-gray-600">ID: ${feature.featureId}</p>
            <p class="text-sm">Operation: <span class="font-medium">${feature.operation}</span></p>
            ${Object.keys(properties).length > 0 ? '<hr class="my-2"/>' : ""}
            ${Object.entries(properties)
              .map(
                ([key, value]) =>
                  `<p class="text-sm"><span class="font-medium">${key}:</span> ${value}</p>`
              )
              .join("")}
          </div>
        `;
        layer.bindPopup(popupContent);

        // Add click handler
        layer.on("click", () => {
          emit("featureClick", feature);
        });

        featureLayer?.addLayer(layer);
      }
    } catch (error) {
      console.error("Error rendering feature:", error);
    }
  });

  // Fit bounds if we have features
  if (bounds.length > 0) {
    const combinedBounds = bounds.reduce((acc, b) => acc.extend(b));
    map.fitBounds(combinedBounds, { padding: [50, 50] });
  }
};

watch(() => props.features, renderFeatures, { deep: true });

onMounted(() => {
  initMap();
  renderFeatures();
});

onBeforeUnmount(() => {
  if (map) {
    map.remove();
  }
});
</script>

<style scoped>
/* Fix for default marker icon in Leaflet */
:deep(.leaflet-container) {
  font-family: inherit;
}
</style>

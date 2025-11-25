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
          <span class="text-sm font-semibold text-green-900"
            >Feature Branch</span
          >
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
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

interface Props {
  mainGeometry: any;
  branchGeometry: any;
}

const props = defineProps<Props>();

const mainMapId = ref(
  `main-map-${Math.random().toString(36).substring(2, 11)}`
);
const branchMapId = ref(
  `branch-map-${Math.random().toString(36).substring(2, 11)}`
);

let mainMap: maplibregl.Map | null = null;
let branchMap: maplibregl.Map | null = null;
let isSyncing = false;

const mainGeometryType = computed(() => props.mainGeometry?.type || "Unknown");
const branchGeometryType = computed(
  () => props.branchGeometry?.type || "Unknown"
);

const createMap = (mapId: string): maplibregl.Map => {
  return new maplibregl.Map({
    container: mapId,
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
    center: [0, 0],
    zoom: 2,
  });
};

const addGeometryToMap = (
  map: maplibregl.Map,
  geometry: any,
  color: string,
  sourceId: string
) => {
  if (!geometry || !map.loaded()) return;

  // Validate geometry has required properties
  if (!geometry.type || !geometry.coordinates) {
    return;
  }

  try {
    // Use FeatureCollection like other working components
    const geojson = {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          geometry: {
            type: geometry.type,
            coordinates: geometry.coordinates,
          },
          properties: { color, geometryType: geometry.type },
        },
      ],
    };

    // Add source
    map.addSource(sourceId, {
      type: "geojson",
      data: geojson as any,
    });

    // Add fill layer for polygons
    map.addLayer({
      id: `${sourceId}-fill`,
      type: "fill",
      source: sourceId,
      filter: [
        "in",
        ["geometry-type"],
        ["literal", ["Polygon", "MultiPolygon"]],
      ],
      paint: {
        "fill-color": color,
        "fill-opacity": 0.3,
      },
    });

    // Add line layer
    map.addLayer({
      id: `${sourceId}-line`,
      type: "line",
      source: sourceId,
      filter: [
        "in",
        ["geometry-type"],
        [
          "literal",
          ["LineString", "MultiLineString", "Polygon", "MultiPolygon"],
        ],
      ],
      paint: {
        "line-color": color,
        "line-width": 3,
        "line-opacity": 0.8,
      },
    });

    // Add circle layer for points
    map.addLayer({
      id: `${sourceId}-point`,
      type: "circle",
      source: sourceId,
      filter: ["in", ["geometry-type"], ["literal", ["Point", "MultiPoint"]]],
      paint: {
        "circle-radius": 8,
        "circle-color": color,
        "circle-opacity": 0.6,
        "circle-stroke-color": color,
        "circle-stroke-width": 2,
        "circle-stroke-opacity": 0.8,
      },
    });

    // Fit bounds to the geometry
    const coordinates = extractCoordinates(geometry);
    if (coordinates.length > 0) {
      const bounds = coordinates.reduce(
        (bounds, coord) => bounds.extend(coord),
        new maplibregl.LngLatBounds(coordinates[0], coordinates[0])
      );
      map.fitBounds(bounds, { padding: 30 });
    }
  } catch (error) {
    console.error("Error adding geometry to map:", error);
  }
};

const extractCoordinates = (geometry: any): [number, number][] => {
  if (!geometry || !geometry.coordinates) return [];

  switch (geometry.type) {
    case "Point":
      return [geometry.coordinates as [number, number]];
    case "LineString":
      return geometry.coordinates as [number, number][];
    case "Polygon":
      return geometry.coordinates[0] as [number, number][];
    case "MultiPoint":
      return geometry.coordinates as [number, number][];
    case "MultiLineString":
      return (geometry.coordinates as [number, number][][]).flat();
    case "MultiPolygon":
      return (geometry.coordinates as [number, number][][][])
        .map((polygon) => polygon[0])
        .flat();
    default:
      return [];
  }
};

const syncMaps = () => {
  if (!mainMap || !branchMap) return;

  mainMap.on("move", () => {
    if (branchMap && mainMap && !isSyncing) {
      isSyncing = true;
      branchMap.setCenter(mainMap.getCenter());
      branchMap.setZoom(mainMap.getZoom());
      branchMap.setBearing(mainMap.getBearing());
      branchMap.setPitch(mainMap.getPitch());
      isSyncing = false;
    }
  });

  branchMap.on("move", () => {
    if (mainMap && branchMap && !isSyncing) {
      isSyncing = true;
      mainMap.setCenter(branchMap.getCenter());
      mainMap.setZoom(branchMap.getZoom());
      mainMap.setBearing(branchMap.getBearing());
      mainMap.setPitch(branchMap.getPitch());
      isSyncing = false;
    }
  });
};

onMounted(() => {
  // Create maps
  mainMap = createMap(mainMapId.value);
  branchMap = createMap(branchMapId.value);

  // Wait for both maps to load
  let mainLoaded = false;
  let branchLoaded = false;

  mainMap.on("load", () => {
    mainLoaded = true;
    if (mainLoaded && props.mainGeometry) {
      addGeometryToMap(
        mainMap!,
        props.mainGeometry,
        "#3b82f6",
        "main-geometry"
      );
    }
  });

  branchMap.on("load", () => {
    branchLoaded = true;
    if (branchLoaded && props.branchGeometry) {
      addGeometryToMap(
        branchMap!,
        props.branchGeometry,
        "#10b981",
        "branch-geometry"
      );
    }
  });

  // Synchronize map views
  syncMaps();

  // Resize maps after mount
  setTimeout(() => {
    mainMap?.resize();
    branchMap?.resize();
  }, 100);
});

onBeforeUnmount(() => {
  if (mainMap) {
    mainMap.remove();
    mainMap = null;
  }
  if (branchMap) {
    branchMap.remove();
    branchMap = null;
  }
});
</script>

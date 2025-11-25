<template>
  <div class="conflict-diff-view">
    <!-- Property Diff Section -->
    <div v-if="hasPropertyDiff" class="mb-4">
      <h4 class="font-semibold text-gray-700 mb-2 flex items-center">
        <svg
          class="w-4 h-4 mr-2"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        Property Changes
      </h4>
      <div class="border rounded-lg overflow-hidden font-mono text-sm">
        <!-- Diff Header -->
        <div class="bg-gray-100 border-b px-3 py-2 text-xs text-gray-600">
          <span class="text-red-600">--- {{ mainLabel }}/properties</span>
          <br />
          <span class="text-green-600">+++ {{ branchLabel }}/properties</span>
        </div>
        <!-- Diff Content -->
        <div class="bg-white">
          <div
            v-for="(line, index) in propertyDiffLines"
            :key="index"
            class="px-3 py-0.5 border-b border-gray-100 last:border-b-0"
            :class="getDiffLineClass(line.type)"
          >
            <span class="select-none mr-2 text-gray-400">{{
              line.type === "remove" ? "-" : line.type === "add" ? "+" : " "
            }}</span>
            <span>{{ line.content }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Geometry Diff Section -->
    <div v-if="hasGeometryDiff" class="mb-4">
      <h4 class="font-semibold text-gray-700 mb-2 flex items-center">
        <svg
          class="w-4 h-4 mr-2"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
          />
        </svg>
        Geometry Changes
      </h4>

      <!-- Map Comparison -->
      <div class="mb-3">
        <ConflictMapComparison
          :mainGeometry="mainGeometry"
          :branchGeometry="branchGeometry"
        />
      </div>

      <!-- Coordinate Diff -->
      <div class="border rounded-lg overflow-hidden font-mono text-xs">
        <!-- Diff Header -->
        <div class="bg-gray-100 border-b px-3 py-2 text-gray-600">
          <div class="flex justify-between items-center">
            <div>
              <span class="text-red-600">--- {{ mainLabel }}/geometry</span>
              <br />
              <span class="text-green-600">+++ {{ branchLabel }}/geometry</span>
            </div>
            <div class="text-right text-gray-500">
              <span v-if="geometrySummary">{{ geometrySummary }}</span>
            </div>
          </div>
        </div>
        <!-- Diff Content -->
        <div class="bg-white max-h-64 overflow-y-auto">
          <div
            v-for="(line, index) in geometryDiffLines"
            :key="index"
            class="px-3 py-0.5 border-b border-gray-100 last:border-b-0"
            :class="getDiffLineClass(line.type)"
          >
            <span class="select-none mr-2 text-gray-400 inline-block w-4">{{
              line.type === "remove" ? "-" : line.type === "add" ? "+" : " "
            }}</span>
            <span class="text-gray-400 mr-2 inline-block w-8 text-right">{{
              line.lineNum || ""
            }}</span>
            <span>{{ line.content }}</span>
          </div>
        </div>
      </div>

      <!-- Summary Stats -->
      <div
        v-if="diffStats"
        class="mt-2 text-xs flex items-center space-x-4 text-gray-600"
      >
        <span class="text-green-600">+{{ diffStats.additions }} additions</span>
        <span class="text-red-600">-{{ diffStats.deletions }} deletions</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import ConflictMapComparison from "./ConflictMapComparison.vue";

interface Props {
  mainVersion: any;
  branchVersion: any;
  mainLabel?: string;
  branchLabel?: string;
}

const props = withDefaults(defineProps<Props>(), {
  mainLabel: "main",
  branchLabel: "branch",
});

interface DiffLine {
  type: "add" | "remove" | "context";
  content: string;
  lineNum?: number;
}

const mainGeometry = computed(() => props.mainVersion?.geometry);
const branchGeometry = computed(() => props.branchVersion?.geometry);

const hasPropertyDiff = computed(() => {
  if (!props.mainVersion?.properties || !props.branchVersion?.properties)
    return false;
  return (
    JSON.stringify(props.mainVersion.properties) !==
    JSON.stringify(props.branchVersion.properties)
  );
});

const hasGeometryDiff = computed(() => {
  if (!mainGeometry.value || !branchGeometry.value) return false;
  return (
    JSON.stringify(mainGeometry.value) !== JSON.stringify(branchGeometry.value)
  );
});

// Generate property diff lines
const propertyDiffLines = computed((): DiffLine[] => {
  const lines: DiffLine[] = [];
  const mainProps = props.mainVersion?.properties || {};
  const branchProps = props.branchVersion?.properties || {};

  const allKeys = new Set([
    ...Object.keys(mainProps),
    ...Object.keys(branchProps),
  ]);

  for (const key of allKeys) {
    const mainValue = mainProps[key];
    const branchValue = branchProps[key];
    const mainStr = formatPropertyValue(key, mainValue);
    const branchStr = formatPropertyValue(key, branchValue);

    if (mainValue === undefined && branchValue !== undefined) {
      // Added in branch
      lines.push({ type: "add", content: branchStr });
    } else if (mainValue !== undefined && branchValue === undefined) {
      // Removed in branch
      lines.push({ type: "remove", content: mainStr });
    } else if (JSON.stringify(mainValue) !== JSON.stringify(branchValue)) {
      // Modified
      lines.push({ type: "remove", content: mainStr });
      lines.push({ type: "add", content: branchStr });
    } else {
      // Unchanged
      lines.push({ type: "context", content: mainStr });
    }
  }

  return lines;
});

// Generate geometry diff lines
const geometryDiffLines = computed((): DiffLine[] => {
  const lines: DiffLine[] = [];

  if (!mainGeometry.value || !branchGeometry.value) return lines;

  const mainCoords = flattenCoordinates(mainGeometry.value);
  const branchCoords = flattenCoordinates(branchGeometry.value);

  // Type line
  if (mainGeometry.value.type !== branchGeometry.value.type) {
    lines.push({
      type: "remove",
      content: `type: "${mainGeometry.value.type}"`,
    });
    lines.push({
      type: "add",
      content: `type: "${branchGeometry.value.type}"`,
    });
  } else {
    lines.push({
      type: "context",
      content: `type: "${mainGeometry.value.type}"`,
    });
  }

  lines.push({ type: "context", content: "coordinates:" });

  // Find differences using LCS-like approach
  const diff = computeCoordinateDiff(mainCoords, branchCoords);
  let lineNum = 1;

  for (const item of diff) {
    if (item.type === "remove") {
      lines.push({
        type: "remove",
        content: `  [${item.coord[0].toFixed(6)}, ${item.coord[1].toFixed(6)}]`,
        lineNum: lineNum++,
      });
    } else if (item.type === "add") {
      lines.push({
        type: "add",
        content: `  [${item.coord[0].toFixed(6)}, ${item.coord[1].toFixed(6)}]`,
        lineNum: lineNum++,
      });
    } else {
      lines.push({
        type: "context",
        content: `  [${item.coord[0].toFixed(6)}, ${item.coord[1].toFixed(6)}]`,
        lineNum: lineNum++,
      });
    }
  }

  return lines;
});

const geometrySummary = computed(() => {
  if (!mainGeometry.value || !branchGeometry.value) return null;

  const mainCount = flattenCoordinates(mainGeometry.value).length;
  const branchCount = flattenCoordinates(branchGeometry.value).length;

  if (mainCount !== branchCount) {
    const diff = Math.abs(branchCount - mainCount);
    return branchCount > mainCount
      ? `+${diff} points (${mainCount} -> ${branchCount})`
      : `-${diff} points (${mainCount} -> ${branchCount})`;
  }

  return `${mainCount} points (modified)`;
});

const diffStats = computed(() => {
  let additions = 0;
  let deletions = 0;

  for (const line of geometryDiffLines.value) {
    if (line.type === "add") additions++;
    if (line.type === "remove") deletions++;
  }

  for (const line of propertyDiffLines.value) {
    if (line.type === "add") additions++;
    if (line.type === "remove") deletions++;
  }

  if (additions === 0 && deletions === 0) return null;

  return { additions, deletions };
});

// Helper functions
function formatPropertyValue(key: string, value: any): string {
  if (value === undefined) return "";
  if (typeof value === "object") {
    return `"${key}": ${JSON.stringify(value)}`;
  }
  if (typeof value === "string") {
    return `"${key}": "${value}"`;
  }
  return `"${key}": ${value}`;
}

function flattenCoordinates(geometry: any): number[][] {
  if (!geometry || !geometry.coordinates) return [];

  const type = geometry.type;
  const coords = geometry.coordinates;

  if (type === "Point") {
    return [coords];
  } else if (type === "LineString" || type === "MultiPoint") {
    return coords;
  } else if (type === "Polygon") {
    return coords[0] || [];
  } else if (type === "MultiLineString") {
    return coords.flat();
  } else if (type === "MultiPolygon") {
    return coords.flatMap((polygon: any) => polygon[0] || []);
  }

  return [];
}

function computeCoordinateDiff(
  mainCoords: number[][],
  branchCoords: number[][]
): Array<{ type: "add" | "remove" | "context"; coord: number[] }> {
  const result: Array<{ type: "add" | "remove" | "context"; coord: number[] }> =
    [];

  // Simple diff algorithm - compare coordinates
  const mainMap = new Map<string, number>();
  const branchMap = new Map<string, number>();

  // Count occurrences
  mainCoords.forEach((coord) => {
    const key = `${coord[0].toFixed(6)},${coord[1].toFixed(6)}`;
    mainMap.set(key, (mainMap.get(key) || 0) + 1);
  });

  branchCoords.forEach((coord) => {
    const key = `${coord[0].toFixed(6)},${coord[1].toFixed(6)}`;
    branchMap.set(key, (branchMap.get(key) || 0) + 1);
  });

  // Process main coords
  const processedMain = new Map<string, number>();
  for (const coord of mainCoords) {
    const key = `${coord[0].toFixed(6)},${coord[1].toFixed(6)}`;
    const mainCount = mainMap.get(key) || 0;
    const branchCount = branchMap.get(key) || 0;
    const processed = processedMain.get(key) || 0;

    if (processed < mainCount) {
      if (branchCount > 0 && processed < branchCount) {
        result.push({ type: "context", coord });
      } else {
        result.push({ type: "remove", coord });
      }
      processedMain.set(key, processed + 1);
    }
  }

  // Process branch coords (only additions)
  const processedBranch = new Map<string, number>();
  for (const coord of branchCoords) {
    const key = `${coord[0].toFixed(6)},${coord[1].toFixed(6)}`;
    const mainCount = mainMap.get(key) || 0;
    const branchCount = branchMap.get(key) || 0;
    const processed = processedBranch.get(key) || 0;

    if (processed >= mainCount && processed < branchCount) {
      result.push({ type: "add", coord });
    }
    processedBranch.set(key, processed + 1);
  }

  // Sort to interleave properly
  return result.sort((a, b) => {
    // Sort by coordinate value for better visualization
    if (a.coord[0] !== b.coord[0]) return a.coord[0] - b.coord[0];
    return a.coord[1] - b.coord[1];
  });
}

function getDiffLineClass(type: "add" | "remove" | "context"): string {
  switch (type) {
    case "add":
      return "bg-green-50 text-green-800";
    case "remove":
      return "bg-red-50 text-red-800";
    default:
      return "text-gray-700";
  }
}
</script>

<style scoped>
.conflict-diff-view {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas,
    "Liberation Mono", monospace;
}
</style>

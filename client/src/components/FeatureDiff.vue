<template>
  <div class="feature-diff bg-white rounded-lg shadow overflow-hidden">
    <div class="bg-gray-50 px-4 py-3 border-b">
      <div class="flex items-center justify-between">
        <div>
          <span
            :class="[
              'inline-block px-2 py-1 text-xs font-semibold rounded mr-2',
              operationClass,
            ]"
          >
            {{ operation.toUpperCase() }}
          </span>
          <span class="font-medium">{{ geometryType }}</span>
        </div>
        <span class="text-xs text-gray-500 font-mono">{{
          featureId.substring(0, 12)
        }}</span>
      </div>
    </div>

    <div v-if="hasGeometryChange" class="border-b">
      <div class="px-4 py-2 bg-yellow-50 border-b border-yellow-200">
        <span class="text-sm font-medium text-yellow-800"
          >Geometry Changed</span
        >
      </div>
      <div class="grid grid-cols-2 divide-x">
        <div class="p-3">
          <div class="text-xs font-medium text-gray-500 mb-2">Before</div>
          <div class="bg-red-50 p-2 rounded border border-red-200">
            <pre class="text-xs overflow-auto max-h-32">{{
              formatGeometry(oldGeometry)
            }}</pre>
          </div>
        </div>
        <div class="p-3">
          <div class="text-xs font-medium text-gray-500 mb-2">After</div>
          <div class="bg-green-50 p-2 rounded border border-green-200">
            <pre class="text-xs overflow-auto max-h-32">{{
              formatGeometry(newGeometry)
            }}</pre>
          </div>
        </div>
      </div>
    </div>

    <div v-if="hasPropertiesChange || operation !== 'update'" class="p-3">
      <div class="text-xs font-medium text-gray-500 mb-2">Properties</div>

      <div v-if="operation === 'create'" class="space-y-1">
        <div
          v-for="(value, key) in newProperties"
          :key="key"
          class="flex items-start bg-green-50 p-2 rounded text-xs"
        >
          <span class="text-green-600 font-mono mr-2">+</span>
          <span class="font-medium text-green-800">{{ key }}:</span>
          <span class="ml-2 text-green-700">{{ formatValue(value) }}</span>
        </div>
        <div
          v-if="Object.keys(newProperties || {}).length === 0"
          class="text-gray-500 text-xs italic"
        >
          No properties
        </div>
      </div>

      <div v-else-if="operation === 'delete'" class="space-y-1">
        <div
          v-for="(value, key) in oldProperties"
          :key="key"
          class="flex items-start bg-red-50 p-2 rounded text-xs"
        >
          <span class="text-red-600 font-mono mr-2">-</span>
          <span class="font-medium text-red-800">{{ key }}:</span>
          <span class="ml-2 text-red-700">{{ formatValue(value) }}</span>
        </div>
      </div>

      <div v-else class="space-y-1">
        <div v-for="key in allPropertyKeys" :key="key">
          <div
            v-if="!hasOldProperty(key) && hasNewProperty(key)"
            class="flex items-start bg-green-50 p-2 rounded text-xs"
          >
            <span class="text-green-600 font-mono mr-2">+</span>
            <span class="font-medium text-green-800">{{ key }}:</span>
            <span class="ml-2 text-green-700">{{
              formatValue(newProperties[key])
            }}</span>
          </div>

          <div
            v-else-if="hasOldProperty(key) && !hasNewProperty(key)"
            class="flex items-start bg-red-50 p-2 rounded text-xs"
          >
            <span class="text-red-600 font-mono mr-2">-</span>
            <span class="font-medium text-red-800">{{ key }}:</span>
            <span class="ml-2 text-red-700">{{
              formatValue(oldProperties[key])
            }}</span>
          </div>

          <div
            v-else-if="propertyChanged(key)"
            class="bg-yellow-50 p-2 rounded text-xs space-y-1"
          >
            <div class="flex items-start">
              <span class="text-red-600 font-mono mr-2">-</span>
              <span class="font-medium text-gray-800">{{ key }}:</span>
              <span class="ml-2 text-red-700 line-through">{{
                formatValue(oldProperties[key])
              }}</span>
            </div>
            <div class="flex items-start">
              <span class="text-green-600 font-mono mr-2">+</span>
              <span class="font-medium text-gray-800">{{ key }}:</span>
              <span class="ml-2 text-green-700">{{
                formatValue(newProperties[key])
              }}</span>
            </div>
          </div>

          <div v-else class="flex items-start p-2 text-xs text-gray-500">
            <span class="font-mono mr-2">&nbsp;</span>
            <span class="font-medium">{{ key }}:</span>
            <span class="ml-2">{{ formatValue(newProperties[key]) }}</span>
          </div>
        </div>

        <div v-if="allPropertyKeys.length === 0" class="text-gray-500 text-xs italic">
          No properties
        </div>
      </div>
    </div>

    <div
      v-if="hasGeometryChange && operation === 'update'"
      class="px-4 py-3 bg-gray-50 border-t"
    >
      <div class="text-xs text-gray-600">
        <span class="font-medium">Coordinate Changes:</span>
        {{ getCoordinatesSummary() }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

interface Props {
  featureId: string;
  geometryType: string;
  operation: "create" | "update" | "delete";
  oldGeometry?: any;
  newGeometry?: any;
  oldProperties?: Record<string, any>;
  newProperties?: Record<string, any>;
}

const props = withDefaults(defineProps<Props>(), {
  oldProperties: () => ({}),
  newProperties: () => ({}),
});

const operationClass = computed(() => {
  switch (props.operation) {
    case "create":
      return "bg-green-600 text-white";
    case "update":
      return "bg-orange-600 text-white";
    case "delete":
      return "bg-red-600 text-white";
    default:
      return "bg-gray-600 text-white";
  }
});

const hasGeometryChange = computed(() => {
  if (props.operation !== "update") return false;
  return (
    JSON.stringify(props.oldGeometry) !== JSON.stringify(props.newGeometry)
  );
});

const hasPropertiesChange = computed(() => {
  if (props.operation !== "update") return true;
  return (
    JSON.stringify(props.oldProperties) !== JSON.stringify(props.newProperties)
  );
});

const allPropertyKeys = computed(() => {
  const keys = new Set([
    ...Object.keys(props.oldProperties || {}),
    ...Object.keys(props.newProperties || {}),
  ]);
  return Array.from(keys).sort();
});

const hasOldProperty = (key: string) => {
  return props.oldProperties && key in props.oldProperties;
};

const hasNewProperty = (key: string) => {
  return props.newProperties && key in props.newProperties;
};

const propertyChanged = (key: string) => {
  if (!hasOldProperty(key) || !hasNewProperty(key)) return false;
  return (
    JSON.stringify(props.oldProperties[key]) !==
    JSON.stringify(props.newProperties[key])
  );
};

const formatValue = (value: any) => {
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
};

const formatGeometry = (geometry: any) => {
  if (!geometry) return "N/A";

  const simplified = {
    type: geometry.type,
    coordinates: simplifyCoordinates(geometry.coordinates),
  };
  return JSON.stringify(simplified, null, 2);
};

const simplifyCoordinates = (coords: any, depth = 0): any => {
  if (!Array.isArray(coords)) return coords;

  if (depth > 1 && Array.isArray(coords[0]) && Array.isArray(coords[0][0])) {
    return `[${coords.length} rings]`;
  }

  if (coords.length === 2 && typeof coords[0] === "number") {
    return coords.map((c: number) => Math.round(c * 1000000) / 1000000);
  }

  if (coords.length > 5) {
    return `[${coords.length} points]`;
  }

  return coords.map((c: any) => simplifyCoordinates(c, depth + 1));
};

const getCoordinatesSummary = () => {
  const oldCount = countCoordinates(props.oldGeometry?.coordinates);
  const newCount = countCoordinates(props.newGeometry?.coordinates);

  if (oldCount === newCount) {
    return `${newCount} coordinates (positions changed)`;
  } else if (newCount > oldCount) {
    return `+${newCount - oldCount} coordinates (${oldCount} → ${newCount})`;
  } else {
    return `-${oldCount - newCount} coordinates (${oldCount} → ${newCount})`;
  }
};

const countCoordinates = (coords: any): number => {
  if (!coords) return 0;
  if (!Array.isArray(coords)) return 0;
  if (coords.length === 2 && typeof coords[0] === "number") return 1;
  return coords.reduce(
    (sum: number, c: any) => sum + countCoordinates(c),
    0
  );
};
</script>

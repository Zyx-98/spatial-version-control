<template>
  <div class="branch-diff-viewer">
    <!-- Summary Stats Bar -->
    <div v-if="summary && !loading" class="summary-bar">
      <div class="stat-card added">
        <div class="stat-icon">+</div>
        <div class="stat-content">
          <div class="stat-label">Added</div>
          <div class="stat-value">{{ summary.added }}</div>
        </div>
      </div>

      <div class="stat-card modified">
        <div class="stat-icon">~</div>
        <div class="stat-content">
          <div class="stat-label">Modified</div>
          <div class="stat-value">{{ summary.modified }}</div>
        </div>
      </div>

      <div class="stat-card deleted">
        <div class="stat-icon">-</div>
        <div class="stat-content">
          <div class="stat-label">Deleted</div>
          <div class="stat-value">{{ summary.deleted }}</div>
        </div>
      </div>

      <div class="stat-card total">
        <div class="stat-icon">=</div>
        <div class="stat-content">
          <div class="stat-label">Total Changes</div>
          <div class="stat-value">{{ summary.totalChanges }}</div>
        </div>
      </div>
    </div>

    <!-- Map Container -->
    <div class="map-wrapper">
      <div ref="mapContainer" class="map-container" />

      <!-- Loading Overlay -->
      <div v-if="loading" class="loading-overlay">
        <div class="spinner-container">
          <div class="spinner"></div>
          <div class="loading-text">Loading branch comparison...</div>
        </div>
      </div>

      <!-- Error State -->
      <div v-if="error && !loading" class="error-overlay">
        <div class="error-container">
          <div class="error-icon">⚠️</div>
          <div class="error-text">{{ error }}</div>
          <button @click="reload" class="retry-button">Retry</button>
        </div>
      </div>

      <!-- Legend -->
      <div v-if="!loading && !error" class="legend">
        <div class="legend-title">Changes</div>
        <div class="legend-items">
          <div class="legend-item">
            <div class="legend-color added"></div>
            <span>Added</span>
          </div>
          <div class="legend-item">
            <div class="legend-color modified"></div>
            <span>Modified</span>
          </div>
          <div class="legend-item">
            <div class="legend-color deleted"></div>
            <span>Deleted</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useMvtLayer } from '@/composables/useMvtLayer';
import apiService from '@/services/api';
import type { DiffSummary } from '@/types';

interface Props {
  sourceBranchId: string;
  targetBranchId: string;
  autoFitBounds?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  autoFitBounds: true
});

const mapContainer = ref<HTMLDivElement | null>(null);
const summary = ref<DiffSummary | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

let map: maplibregl.Map | null = null;
const { addDiffMvtLayer } = useMvtLayer();

const initializeMap = async () => {
  if (!mapContainer.value) return;

  loading.value = true;
  error.value = null;

  try {
    // Load diff summary first
    summary.value = await apiService.getBranchDiffSummary(
      props.sourceBranchId,
      props.targetBranchId
    );

    // Create map
    map = new maplibregl.Map({
      container: mapContainer.value,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
            maxzoom: 19
          }
        },
        layers: [{
          id: 'osm',
          type: 'raster',
          source: 'osm'
        }]
      },
      center: [-122.4194, 37.7749],
      zoom: 13
    });

    // Add navigation controls
    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('load', () => {
      if (!map) return;

      // Add diff MVT layer
      addDiffMvtLayer(map, props.sourceBranchId, props.targetBranchId, {
        sourceId: 'branch-diff'
      });

      // Fit to bounds if available and enabled
      if (props.autoFitBounds && summary.value?.affectedArea) {
        const { minLng, minLat, maxLng, maxLat } = summary.value.affectedArea;
        map.fitBounds([
          [minLng, minLat],
          [maxLng, maxLat]
        ], {
          padding: 50,
          duration: 1000
        });
      }

      loading.value = false;
    });

    map.on('error', (e) => {
      console.error('Map error:', e);
      error.value = 'Failed to load map';
      loading.value = false;
    });

  } catch (err) {
    console.error('Error initializing diff viewer:', err);
    error.value = err instanceof Error ? err.message : 'Failed to load branch comparison';
    loading.value = false;
  }
};

const reload = () => {
  if (map) {
    map.remove();
    map = null;
  }
  initializeMap();
};

onMounted(() => {
  initializeMap();
});

onBeforeUnmount(() => {
  if (map) {
    map.remove();
    map = null;
  }
});

// Watch for branch ID changes
watch(() => [props.sourceBranchId, props.targetBranchId], () => {
  reload();
});
</script>

<style scoped>
.branch-diff-viewer {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: #f9fafb;
}

/* Summary Stats Bar */
.summary-bar {
  display: flex;
  gap: 16px;
  padding: 16px;
  background: white;
  border-bottom: 1px solid #e5e7eb;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.stat-card {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: #f9fafb;
  border-radius: 8px;
  border: 2px solid transparent;
  transition: all 0.2s;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.stat-card.added {
  border-color: #10b981;
}

.stat-card.modified {
  border-color: #3b82f6;
}

.stat-card.deleted {
  border-color: #ef4444;
}

.stat-card.total {
  border-color: #6b7280;
}

.stat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  font-size: 20px;
  font-weight: bold;
  color: white;
}

.stat-card.added .stat-icon {
  background: #10b981;
}

.stat-card.modified .stat-icon {
  background: #3b82f6;
}

.stat-card.deleted .stat-icon {
  background: #ef4444;
}

.stat-card.total .stat-icon {
  background: #6b7280;
}

.stat-content {
  flex: 1;
}

.stat-label {
  font-size: 12px;
  font-weight: 500;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #1f2937;
  line-height: 1.2;
}

/* Map Wrapper */
.map-wrapper {
  position: relative;
  flex: 1;
  min-height: 500px;
}

.map-container {
  width: 100%;
  height: 100%;
}

/* Loading Overlay */
.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.spinner-container {
  text-align: center;
}

.spinner {
  width: 48px;
  height: 48px;
  border: 4px solid #e5e7eb;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-text {
  font-size: 14px;
  color: #6b7280;
  font-weight: 500;
}

/* Error Overlay */
.error-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.95);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.error-container {
  text-align: center;
  padding: 32px;
}

.error-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.error-text {
  font-size: 16px;
  color: #ef4444;
  font-weight: 500;
  margin-bottom: 16px;
}

.retry-button {
  padding: 8px 16px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.retry-button:hover {
  background: #2563eb;
}

/* Legend */
.legend {
  position: absolute;
  bottom: 24px;
  right: 24px;
  background: white;
  padding: 12px 16px;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  z-index: 100;
}

.legend-title {
  font-size: 12px;
  font-weight: 700;
  color: #1f2937;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
}

.legend-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #4b5563;
}

.legend-color {
  width: 20px;
  height: 12px;
  border-radius: 2px;
}

.legend-color.added {
  background: #10b981;
}

.legend-color.modified {
  background: #3b82f6;
}

.legend-color.deleted {
  background: #ef4444;
  background-image: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 2px,
    rgba(255, 255, 255, 0.3) 2px,
    rgba(255, 255, 255, 0.3) 4px
  );
}
</style>

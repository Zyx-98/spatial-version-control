<template>
  <div class="branch-comparison-view">
    <div class="header">
      <h1 class="title">Branch Comparison</h1>
      <p class="subtitle">
        Compare changes between branches using efficient MVT tiles
      </p>
    </div>

    <!-- Branch Selection -->
    <div class="selection-panel">
      <div class="branch-selector">
        <label class="label">Source Branch (Your Changes)</label>
        <select
          v-model="selectedSourceBranch"
          class="select-input"
          :disabled="loadingBranches"
        >
          <option value="">Select source branch...</option>
          <option
            v-for="branch in branches"
            :key="branch.id"
            :value="branch.id"
          >
            {{ branch.name }}
          </option>
        </select>
      </div>

      <div class="arrow-icon">→</div>

      <div class="branch-selector">
        <label class="label">Target Branch (Compare Against)</label>
        <select
          v-model="selectedTargetBranch"
          class="select-input"
          :disabled="loadingBranches"
        >
          <option value="">Select target branch...</option>
          <option
            v-for="branch in branches"
            :key="branch.id"
            :value="branch.id"
            :disabled="branch.id === selectedSourceBranch"
          >
            {{ branch.name }}
          </option>
        </select>
      </div>

      <button
        @click="compareBranches"
        class="compare-button"
        :disabled="!canCompare || comparing"
      >
        <span v-if="comparing">Comparing...</span>
        <span v-else>Compare Branches</span>
      </button>
    </div>

    <!-- Diff Viewer -->
    <div v-if="showDiff" class="diff-container">
      <BranchDiffViewer
        :source-branch-id="selectedSourceBranch"
        :target-branch-id="selectedTargetBranch"
        :auto-fit-bounds="true"
      />
    </div>

    <!-- Empty State -->
    <div v-else class="empty-state">
      <div class="empty-icon">🗺️</div>
      <h3 class="empty-title">No Comparison Selected</h3>
      <p class="empty-text">
        Select two branches above and click "Compare Branches" to visualize the differences on the map.
      </p>
      <div class="features-list">
        <h4 class="features-title">Features:</h4>
        <ul class="features-items">
          <li>✅ Server-side diff computation</li>
          <li>✅ Efficient MVT tile rendering</li>
          <li>✅ Color-coded changes (Added/Modified/Deleted)</li>
          <li>✅ Interactive popups with feature details</li>
          <li>✅ Handles millions of features</li>
        </ul>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loadingBranches" class="loading-state">
      <div class="spinner"></div>
      <p>Loading branches...</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import BranchDiffViewer from '@/components/BranchDiffViewer.vue';
import apiService from '@/services/api';
import type { Branch } from '@/types';

const route = useRoute();

const branches = ref<Branch[]>([]);
const loadingBranches = ref(false);
const selectedSourceBranch = ref('');
const selectedTargetBranch = ref('');
const showDiff = ref(false);
const comparing = ref(false);

const canCompare = computed(() => {
  return selectedSourceBranch.value &&
         selectedTargetBranch.value &&
         selectedSourceBranch.value !== selectedTargetBranch.value;
});

const compareBranches = () => {
  if (!canCompare.value) return;
  comparing.value = true;
  showDiff.value = true;
  // Small delay to show loading state
  setTimeout(() => {
    comparing.value = false;
  }, 300);
};

const loadBranches = async () => {
  const datasetId = route.query.datasetId as string;

  if (!datasetId) {
    console.warn('No datasetId provided in query params');
    return;
  }

  loadingBranches.value = true;
  try {
    branches.value = await apiService.getBranches(datasetId);

    // Auto-select branches if provided in query params
    const sourceId = route.query.sourceBranchId as string;
    const targetId = route.query.targetBranchId as string;

    if (sourceId && branches.value.some(b => b.id === sourceId)) {
      selectedSourceBranch.value = sourceId;
    }

    if (targetId && branches.value.some(b => b.id === targetId)) {
      selectedTargetBranch.value = targetId;
    }

    // Auto-compare if both branches are selected
    if (canCompare.value) {
      compareBranches();
    }
  } catch (error) {
    console.error('Error loading branches:', error);
  } finally {
    loadingBranches.value = false;
  }
};

onMounted(() => {
  loadBranches();
});
</script>

<style scoped>
.branch-comparison-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f9fafb;
}

/* Header */
.header {
  padding: 24px 24px 16px;
  background: white;
  border-bottom: 1px solid #e5e7eb;
}

.title {
  font-size: 28px;
  font-weight: 700;
  color: #1f2937;
  margin: 0 0 8px 0;
}

.subtitle {
  font-size: 14px;
  color: #6b7280;
  margin: 0;
}

/* Selection Panel */
.selection-panel {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  padding: 20px 24px;
  background: white;
  border-bottom: 1px solid #e5e7eb;
}

.branch-selector {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.label {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.select-input {
  padding: 10px 12px;
  border: 2px solid #e5e7eb;
  border-radius: 6px;
  font-size: 14px;
  color: #1f2937;
  background: white;
  transition: border-color 0.2s;
  cursor: pointer;
}

.select-input:hover:not(:disabled) {
  border-color: #3b82f6;
}

.select-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.select-input:disabled {
  background: #f3f4f6;
  cursor: not-allowed;
}

.arrow-icon {
  font-size: 24px;
  color: #6b7280;
  margin-bottom: 10px;
}

.compare-button {
  padding: 10px 24px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  white-space: nowrap;
}

.compare-button:hover:not(:disabled) {
  background: #2563eb;
}

.compare-button:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

/* Diff Container */
.diff-container {
  flex: 1;
  display: flex;
  min-height: 0;
}

/* Empty State */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  text-align: center;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 24px;
}

.empty-title {
  font-size: 20px;
  font-weight: 700;
  color: #1f2937;
  margin: 0 0 8px 0;
}

.empty-text {
  font-size: 14px;
  color: #6b7280;
  margin: 0 0 32px 0;
  max-width: 500px;
}

.features-list {
  background: white;
  padding: 24px 32px;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  text-align: left;
}

.features-title {
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
  margin: 0 0 16px 0;
}

.features-items {
  margin: 0;
  padding: 0;
  list-style: none;
}

.features-items li {
  font-size: 14px;
  color: #4b5563;
  margin-bottom: 8px;
  padding-left: 4px;
}

/* Loading State */
.loading-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: #6b7280;
}

.spinner {
  width: 48px;
  height: 48px;
  border: 4px solid #e5e7eb;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>

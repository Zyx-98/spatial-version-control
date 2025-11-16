<template>
  <div class="max-w-7xl mx-auto">
    <div class="mb-6">
      <h1 class="text-3xl font-bold text-gray-900">Merge Requests</h1>
      <p class="text-gray-600 mt-2">Review and manage merge requests</p>
    </div>

    <div v-if="mergeRequestStore.loading" class="text-center py-12">
      <div
        class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"
      ></div>
    </div>

    <div v-else-if="mergeRequestStore.error" class="bg-red-50 p-4 rounded-md">
      <p class="text-red-800">{{ mergeRequestStore.error }}</p>
    </div>

    <div v-else>
      <!-- Tabs -->
      <div class="mb-6 border-b border-gray-200">
        <nav class="-mb-px flex space-x-8">
          <button
            v-for="tab in tabs"
            :key="tab.status"
            @click="currentTab = tab.status"
            :class="[
              'py-4 px-1 border-b-2 font-medium text-sm',
              currentTab === tab.status
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
            ]"
          >
            {{ tab.label }}
            <span
              :class="[
                'ml-2 px-2 py-1 text-xs rounded-full',
                currentTab === tab.status
                  ? 'bg-primary-100 text-primary-600'
                  : 'bg-gray-100 text-gray-600',
              ]"
            >
              {{ getCountByStatus(tab.status) }}
            </span>
          </button>
        </nav>
      </div>

      <!-- Merge Requests List -->
      <div class="bg-white rounded-lg shadow divide-y divide-gray-200">
        <div
          v-for="mr in filteredMergeRequests"
          :key="mr.id"
          class="p-6 hover:bg-gray-50 cursor-pointer"
          @click="router.push(`/merge-requests/${mr.id}`)"
        >
          <div class="flex justify-between items-start">
            <div class="flex-1">
              <div class="flex items-center space-x-3">
                <h3 class="text-lg font-semibold text-gray-900">
                  {{ mr.title }}
                </h3>
                <span
                  :class="[
                    'px-2 py-1 text-xs font-medium rounded-full',
                    getStatusClass(mr.status),
                  ]"
                >
                  {{ mr.status }}
                </span>
                <span
                  v-if="mr.hasConflicts"
                  class="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full"
                >
                  Conflicts
                </span>
              </div>
              <p class="text-gray-600 mt-1">
                {{ mr.description || "No description" }}
              </p>
              <div
                class="mt-3 flex items-center space-x-6 text-sm text-gray-500"
              >
                <span
                  >{{ mr.sourceBranch?.name }} →
                  {{ mr.targetBranch?.name }}</span
                >
                <span>Created by {{ mr.createdBy?.username }}</span>
                <span>{{ formatDate(mr.createdAt) }}</span>
              </div>
            </div>
            <div>
              <svg
                class="h-5 w-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </div>
          </div>
        </div>

        <div
          v-if="filteredMergeRequests.length === 0"
          class="p-12 text-center text-gray-500"
        >
          No {{ currentTab }} merge requests
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useMergeRequestStore } from "@/stores/mergeRequest";
import { MergeRequestStatus } from "@/types";
import { format } from "date-fns";

const router = useRouter();
const mergeRequestStore = useMergeRequestStore();

const currentTab = ref<MergeRequestStatus | "all">("all");

const tabs = [
  { label: "All", status: "all" as const },
  { label: "Open", status: MergeRequestStatus.OPEN },
  { label: "Approved", status: MergeRequestStatus.APPROVED },
  { label: "Merged", status: MergeRequestStatus.MERGED },
  { label: "Rejected", status: MergeRequestStatus.REJECTED },
];

const filteredMergeRequests = computed(() => {
  if (currentTab.value === "all") {
    return mergeRequestStore.mergeRequests;
  }
  return mergeRequestStore.mergeRequests.filter(
    (mr) => mr.status === currentTab.value
  );
});

const getCountByStatus = (status: MergeRequestStatus | "all") => {
  if (status === "all") {
    return mergeRequestStore.mergeRequests.length;
  }
  return mergeRequestStore.mergeRequests.filter((mr) => mr.status === status)
    .length;
};

const getStatusClass = (status: MergeRequestStatus) => {
  switch (status) {
    case MergeRequestStatus.OPEN:
      return "bg-blue-100 text-blue-800";
    case MergeRequestStatus.APPROVED:
      return "bg-green-100 text-green-800";
    case MergeRequestStatus.MERGED:
      return "bg-purple-100 text-purple-800";
    case MergeRequestStatus.REJECTED:
      return "bg-red-100 text-red-800";
    case MergeRequestStatus.CLOSED:
      return "bg-gray-100 text-gray-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
};

const formatDate = (date: string) => {
  return format(new Date(date), "MMM dd, yyyy");
};

onMounted(() => {
  mergeRequestStore.fetchMergeRequests();
});
</script>

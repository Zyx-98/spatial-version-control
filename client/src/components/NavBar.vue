<template>
  <nav class="bg-white shadow-lg">
    <div class="container mx-auto px-4">
      <div class="flex justify-between items-center h-16">
        <div class="flex items-center space-x-8">
          <router-link to="/" class="text-xl font-bold text-primary-600">
            Spatial Version Control
          </router-link>
          <div class="hidden md:flex space-x-4">
            <router-link
              to="/datasets"
              class="px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-100"
              active-class="bg-primary-50 text-primary-700"
            >
              Datasets
            </router-link>
            <router-link
              to="/merge-requests"
              class="px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-100"
              active-class="bg-primary-50 text-primary-700"
            >
              Merge Requests
            </router-link>
          </div>
        </div>

        <div class="flex items-center space-x-4">
          <div class="text-sm text-gray-700">
            <span class="font-medium">{{ authStore.user?.username }}</span>
            <span
              class="ml-2 px-2 py-1 text-xs rounded-full"
              :class="
                authStore.isAdmin
                  ? 'bg-purple-100 text-purple-800'
                  : 'bg-blue-100 text-blue-800'
              "
            >
              {{ authStore.isAdmin ? "Admin" : "User" }}
            </span>
          </div>
          <button
            @click="handleLogout"
            class="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const router = useRouter();
const authStore = useAuthStore();

const handleLogout = () => {
  authStore.logout();
  router.push("/login");
};
</script>

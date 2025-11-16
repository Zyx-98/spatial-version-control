<template>
  <div id="app" class="min-h-screen bg-gray-50">
    <NavBar v-if="authStore.isAuthenticated" />
    <main class="container mx-auto px-4 py-8">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useAuthStore } from "@/stores/auth";
import NavBar from "@/components/NavBar.vue";

const authStore = useAuthStore();

onMounted(() => {
  authStore.initAuth();
});
</script>

<style>
#app {
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue",
    Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
</style>

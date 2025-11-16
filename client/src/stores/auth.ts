import { defineStore } from "pinia";
import { ref, computed } from "vue";
import api from "@/services/api";
import type { User, LoginRequest, RegisterRequest, UserRole } from "@/types";

export const useAuthStore = defineStore("auth", () => {
  const user = ref<User | null>(null);
  const token = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const isAuthenticated = computed(() => !!token.value);
  const isAdmin = computed(() => user.value?.role === "admin");

  const initAuth = () => {
    const savedToken = localStorage.getItem("token");
    const savedUser = localStorage.getItem("user");

    if (savedToken && savedUser) {
      token.value = savedToken;
      user.value = JSON.parse(savedUser);
    }
  };

  const login = async (credentials: LoginRequest) => {
    loading.value = true;
    error.value = null;
    try {
      const response = await api.login(credentials);
      token.value = response.accessToken;
      user.value = response.user;

      localStorage.setItem("token", response.accessToken);
      localStorage.setItem("user", JSON.stringify(response.user));

      return true;
    } catch (err: any) {
      error.value = err.response?.data?.message || "Login failed";
      return false;
    } finally {
      loading.value = false;
    }
  };

  const register = async (data: RegisterRequest) => {
    loading.value = true;
    error.value = null;
    try {
      await api.register(data);
      return true;
    } catch (err: any) {
      error.value = err.response?.data?.message || "Registration failed";
      return false;
    } finally {
      loading.value = false;
    }
  };

  const logout = () => {
    user.value = null;
    token.value = null;
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  };

  return {
    user,
    token,
    loading,
    error,
    isAuthenticated,
    isAdmin,
    initAuth,
    login,
    register,
    logout,
  };
});

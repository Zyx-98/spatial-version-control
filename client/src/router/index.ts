import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
} from "vue-router";
import { useAuthStore } from "@/stores/auth";

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    redirect: "/datasets",
  },
  {
    path: "/login",
    name: "Login",
    component: () => import("@/views/LoginView.vue"),
    meta: { requiresAuth: false },
  },
  {
    path: "/register",
    name: "Register",
    component: () => import("@/views/RegisterView.vue"),
    meta: { requiresAuth: false },
  },
  {
    path: "/datasets",
    name: "Datasets",
    component: () => import("@/views/DatasetsView.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/datasets/:id",
    name: "DatasetDetail",
    component: () => import("@/views/DatasetDetailView.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/datasets/:datasetId/branches/:branchId",
    name: "BranchDetail",
    component: () => import("@/views/BranchDetailView.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/datasets/:datasetId/branches/:branchId/commit",
    name: "CreateCommit",
    component: () => import("@/views/CreateCommitView.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/merge-requests",
    name: "MergeRequests",
    component: () => import("@/views/MergeRequestsView.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/merge-requests/:id",
    name: "MergeRequestDetail",
    component: () => import("@/views/MergeRequestDetailView.vue"),
    meta: { requiresAuth: true },
  },
  {
    path: "/branch-comparison",
    name: "BranchComparison",
    component: () => import("@/views/BranchComparisonView.vue"),
    meta: { requiresAuth: true },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// Navigation guard
router.beforeEach((to, _from, next) => {
  const authStore = useAuthStore();
  const requiresAuth = to.meta.requiresAuth !== false;

  if (requiresAuth && !authStore.isAuthenticated) {
    next("/login");
  } else if (
    !requiresAuth &&
    authStore.isAuthenticated &&
    (to.path === "/login" || to.path === "/register")
  ) {
    next("/datasets");
  } else {
    next();
  }
});

export default router;

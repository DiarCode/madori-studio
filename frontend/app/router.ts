import type { RouterConfig } from "@nuxt/schema";

export default {
  // https://router.vuejs.org/api/interfaces/routeroptions#routes
  routes: _routes => [
    {
      name: "index",
      path: "/",
      component: () => import("./pages/index.vue"),
    },
    {
      name: "home",
      path: "/home",
      component: () => import("../layers/home/pages/home-page.vue"),
    },
    {
      name: "about",
      path: "/about",
      component: () => import("../layers/home/pages/about-page.vue"),
    },
    {
      name: "login",
      path: "/login",
      component: () => import("../layers/auth/pages/login.page.vue"),
    },
  ],
} satisfies RouterConfig;

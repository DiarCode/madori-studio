import tailwindcss from "@tailwindcss/vite";
import { createResolver } from "@nuxt/kit";

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  css: ["~/core/assets/styles/tailwind.css"],

  vite: {
    plugins: [tailwindcss()],
  },

  modules: [
    "@nuxt/eslint",
    "@nuxt/fonts",
    "@nuxt/hints",
    "@nuxt/image",
    "@nuxt/test-utils",
    "shadcn-nuxt",
    "@tresjs/nuxt",
  ],

  shadcn: {
    prefix: "",
    componentDir: "@/core/components/ui",
  },

  imports: {
    autoImport: false,
  },

  hooks: {
    "pages:routerOptions"({ files }) {
      const resolver = createResolver(import.meta.url);
      // add a route
      files.push({
        path: resolver.resolve("./app/router.ts"),
        optional: true,
      });
    },
  },
});
import { defineNuxtRouteMiddleware, navigateTo } from "#app";

export default defineNuxtRouteMiddleware(to => {
  if (to.name === "about") {
    console.log("Navigating to the About page");
    return navigateTo("/login");
  }
});

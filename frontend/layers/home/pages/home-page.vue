<template>
  <div>
    <header class="p-6">
      <nav>
        <ul class="flex gap-4 p-4 border border-slate-200 rounded-xl w-fit">
          <li><NuxtLink to="/">Index</NuxtLink></li>
          <li><NuxtLink to="/home">Home</NuxtLink></li>
          <li><NuxtLink to="/about">About</NuxtLink></li>
        </ul>
      </nav>
    </header>

    <h1>Home Page</h1>
  </div>
</template>

<script lang="ts" setup>
import { definePageMeta } from "#imports";

definePageMeta({
  name: "about",
});
</script>

<style></style>

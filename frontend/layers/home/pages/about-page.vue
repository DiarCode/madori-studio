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

    <h1>About</h1>
    <p>{{ hello }}</p>
    <Button @click="$router.back">Back</Button>
  </div>
</template>

<script lang="ts" setup>
import { Button } from "~/core/components/ui/button";
import { useHello } from "~/core/composables/hello.composable";

const hello = useHello();
</script>

<style></style>

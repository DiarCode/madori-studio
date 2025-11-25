<template>
  <div
    class="bottom-6 z-50 absolute inset-x-0 flex justify-center pointer-events-none"
  >
    <div
      class="flex items-center gap-3 bg-white shadow-xl px-4 py-2 border border-black/10 rounded-full text-[12px] text-black pointer-events-auto md:text-[13px]"
    >
      <!-- 2D/3D mode -->
      <div class="flex items-center gap-1 bg-black/5 p-1 rounded-full">
        <button
          type="button"
          class="flex items-center gap-1 px-3 py-1.5 rounded-full font-medium text-xs uppercase tracking-wider transition-all"
          :class="
            mode === '2d'
              ? 'bg-black text-white shadow-sm'
              : 'text-black/60 hover:text-black'
          "
          @click="$emit('update:mode', '2d')"
        >
          <Square class="w-3.5 h-3.5" />
          <span>2D</span>
        </button>
        <button
          type="button"
          class="flex items-center gap-1 px-3 py-1.5 rounded-full font-medium text-xs uppercase tracking-wider transition-all"
          :class="
            mode === '3d'
              ? 'bg-black text-white shadow-sm'
              : 'text-black/60 hover:text-black'
          "
          @click="$emit('update:mode', '3d')"
        >
          <Box class="w-3.5 h-3.5" />
          <span>3D</span>
        </button>
      </div>

      <span class="bg-black/10 w-px h-5" />

      <!-- Tools -->
      <div class="flex items-center gap-1">
        <button
          v-for="t in tools"
          :key="t.value"
          type="button"
          class="flex items-center gap-1 px-2.5 py-1.5 rounded-full transition-colors"
          :class="
            tool === t.value
              ? 'bg-black/10 text-black font-medium'
              : 'text-black/60 hover:bg-black/5'
          "
          @click="$emit('update:tool', t.value)"
        >
          <component :is="toolIcon(t.value)" class="w-4 h-4" />
          <span class="text-xs uppercase tracking-wider">{{ t.label }}</span>
        </button>
      </div>

      <span class="bg-black/10 w-px h-5" />

      <!-- Toggles -->
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="flex items-center gap-1 px-2 py-1 rounded-full transition-colors"
          :class="
            showDimensions
              ? 'bg-black/10 text-black'
              : 'text-black/50 hover:bg-black/5'
          "
          @click="$emit('update:showDimensions', !showDimensions)"
          title="Show Dimensions"
        >
          <Ruler class="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          class="flex items-center gap-1 px-2 py-1 rounded-full transition-colors"
          :class="
            lockOrthogonal
              ? 'bg-black/10 text-black'
              : 'text-black/50 hover:bg-black/5'
          "
          @click="$emit('update:lockOrthogonal', !lockOrthogonal)"
          title="Lock Orthogonal (90°)"
        >
          <Square class="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          class="flex items-center gap-1 px-2 py-1 rounded-full transition-colors"
          :class="
            incrementalSnap
              ? 'bg-black/10 text-black'
              : 'text-black/50 hover:bg-black/5'
          "
          @click="$emit('update:incrementalSnap', !incrementalSnap)"
          title="Snap to Grid"
        >
          <Grid class="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          class="flex items-center gap-1 px-2 py-1 rounded-full transition-colors"
          :class="
            xrayMode
              ? 'bg-black/10 text-black'
              : 'text-black/50 hover:bg-black/5'
          "
          @click="$emit('update:xrayMode', !xrayMode)"
          title="X-Ray Mode"
        >
          <Eye class="w-3.5 h-3.5" />
        </button>

        <!-- Selection filter -->
        <select
          :value="selectionFilter"
          @change="
            $emit('update:selectionFilter', ($event.target as any).value)
          "
          class="bg-black/5 ml-1 px-2 py-1 border border-black/10 rounded-md focus:outline-none text-[10px] text-black/80 uppercase tracking-wide"
        >
          <option value="all">All</option>
          <option value="walls">Walls</option>
          <option value="openings">Openings</option>
        </select>
      </div>

      <span class="bg-black/10 w-px h-5" />

      <div class="opacity-60 text-[10px] md:text-[11px]">
        {{ stats }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  MousePointer2,
  Square,
  PanelsTopLeft,
  DoorOpen,
  Ruler,
  Eye,
  Box,
  Grid,
} from "lucide-vue-next";
import type { ToolType } from "./Plan2D.vue";

defineProps<{
  mode: "2d" | "3d";
  tool: ToolType;
  showDimensions: boolean;
  lockOrthogonal: boolean;
  incrementalSnap: boolean;
  xrayMode: boolean;
  selectionFilter: string;
  stats: string;
}>();

defineEmits<{
  (e: "update:mode", val: "2d" | "3d"): void;
  (e: "update:tool", val: ToolType): void;
  (e: "update:showDimensions", val: boolean): void;
  (e: "update:lockOrthogonal", val: boolean): void;
  (e: "update:incrementalSnap", val: boolean): void;
  (e: "update:xrayMode", val: boolean): void;
  (e: "update:selectionFilter", val: string): void;
}>();

const tools: { value: ToolType; label: string }[] = [
  { value: "select", label: "Select" },
  { value: "wall", label: "Wall" },
  { value: "window", label: "Window" },
  { value: "door", label: "Door" },
  { value: "measure", label: "Measure" },
];

function toolIcon(tool: ToolType) {
  switch (tool) {
    case "select":
      return MousePointer2;
    case "wall":
      return Square;
    case "window":
      return PanelsTopLeft;
    case "door":
      return DoorOpen;
    case "measure":
      return Ruler;
    default:
      return MousePointer2;
  }
}
</script>

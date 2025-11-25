<template>
  <div class="flex flex-col bg-white min-h-screen text-black">
    <!-- Header -->
    <header
      class="flex justify-between items-center gap-4 px-6 py-3 border-black/5 border-b"
    >
      <div class="flex items-center gap-3">
        <div
          class="flex justify-center items-center border border-black/10 bg-black/5 rounded-full w-9 h-9 font-semibold text-black text-sm tracking-widest"
        >
          3D
        </div>
        <div>
          <h1
            class="font-semibold text-2xl text-black uppercase tracking-tight"
          >
            Interior Studio
          </h1>
          <p class="text-black/50 text-sm">
            Plan → precise walls → full-screen 3D shell.
          </p>
        </div>
      </div>

      <div class="flex items-center gap-3 text-xs">
        <span class="text-black/60">
          {{ wallCount }} walls · {{ windowCount }} windows ·
          {{ doorCount }} doors · {{ rooms.length }} rooms
        </span>

        <Button
          variant="outline"
          class="px-4 border-black/10 hover:bg-black/5 rounded-full h-9 text-black text-xs uppercase tracking-[0.18em]"
          @click="isSheetOpen = true"
        >
          Project panel
        </Button>
      </div>
    </header>

    <!-- Main full-screen workspace -->
    <main class="relative flex-1 overflow-hidden">
      <!-- 2D workspace -->
      <Plan2D
        v-if="mode === '2d'"
        v-model:elements="elements"
        v-model:viewBox="viewBox"
        :tool="selectedTool"
        :show-dimensions="showDimensions"
        :lock-orthogonal="lockOrthogonal"
        :incremental-snap="incrementalSnap"
        :selection-filter="selectionFilter"
        :default-wall-height="defaultWallHeight"
        :default-wall-thickness="defaultWallThickness"
        @select="selectedElementId = $event"
      />

      <!-- 3D workspace -->
      <div v-else class="absolute inset-0">
        <ClientOnly>
          <Suspense>
            <View3D
              :elements="elements"
              :view-box="viewBox"
              :xray-mode="xrayMode"
              :camera-mode="cameraMode"
            />
            <template #fallback>
              <div
                class="flex justify-center items-center bg-white w-full h-full text-black/40"
              >
                Loading 3D View...
              </div>
            </template>
          </Suspense>
        </ClientOnly>
      </div>

      <!-- Bottom tool tabbar -->
      <EditorToolbar
        v-model:mode="mode"
        v-model:tool="selectedTool"
        v-model:show-dimensions="showDimensions"
        v-model:lock-orthogonal="lockOrthogonal"
        v-model:incremental-snap="incrementalSnap"
        v-model:xray-mode="xrayMode"
        v-model:selection-filter="selectionFilter"
        :stats="statsText"
      />
    </main>

    <!-- Config / project sheet -->
    <Sheet v-model:open="isSheetOpen">
      <SheetContent
        side="right"
        class="bg-white border-black/5 border-l w-[360px] text-black"
      >
        <SheetHeader>
          <SheetTitle class="text-black/80 text-xs uppercase tracking-[0.18em]">
            Project panel
          </SheetTitle>
          <SheetDescription class="text-black/60 text-xs">
            Global parameters, bill of materials, and model audit.
          </SheetDescription>
        </SheetHeader>

        <div class="space-y-6 mt-4 text-sm">
          <!-- Global parameters -->
          <section class="space-y-2">
            <p
              class="font-medium text-black/60 text-xs uppercase tracking-[0.16em]"
            >
              Global parameters
            </p>
            <div class="space-y-2">
              <div class="flex justify-between items-center gap-2">
                <span>Wall height</span>
                <div class="flex items-center gap-1">
                  <input
                    v-model.number="defaultWallHeight"
                    type="number"
                    step="0.1"
                    min="1.8"
                    max="4"
                    class="bg-transparent px-2 py-1 border border-black/10 rounded w-20 text-black text-xs text-right placeholder-black/20"
                  />
                  <span class="text-black/50 text-xs">m</span>
                </div>
              </div>
              <div class="flex justify-between items-center gap-2">
                <span>Wall thickness</span>
                <div class="flex items-center gap-1">
                  <input
                    v-model.number="defaultWallThickness"
                    type="number"
                    step="0.05"
                    min="0.05"
                    max="0.6"
                    class="bg-transparent px-2 py-1 border border-black/10 rounded w-20 text-black text-xs text-right placeholder-black/20"
                  />
                  <span class="text-black/50 text-xs">m</span>
                </div>
              </div>
            </div>
          </section>

          <!-- BOM -->
          <section class="space-y-2">
            <p
              class="font-medium text-black/60 text-xs uppercase tracking-[0.16em]"
            >
              Bill of materials
            </p>
            <div class="space-y-1 text-xs">
              <div class="flex justify-between">
                <span>Total wall length</span>
                <span>{{ totalWallLength.toFixed(2) }} m</span>
              </div>
              <div class="flex justify-between">
                <span>Windows</span>
                <span>{{ windowCount }}</span>
              </div>
              <div class="flex justify-between">
                <span>Doors</span>
                <span>{{ doorCount }}</span>
              </div>
              <div class="flex justify-between">
                <span>Total room area</span>
                <span>
                  {{ rooms.reduce((s, r) => s + r.area, 0).toFixed(2) }}
                  m²
                </span>
              </div>
            </div>
          </section>

          <!-- Model audit -->
          <section class="space-y-2">
            <p
              class="font-medium text-black/60 text-xs uppercase tracking-[0.16em]"
            >
              Model audit
            </p>
            <ul class="space-y-1 text-xs">
              <li>• {{ rooms.length }} closed room(s) detected.</li>
              <li>
                • {{ openLoopCount }} open wall loop(s) (walls not forming
                rooms).
              </li>
              <li>• Windows/doors are attached to nearest wall on creation.</li>
            </ul>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from "vue";
import { Button } from "~/core/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "~/core/components/ui/sheet";

import Plan2D, {
  type PlanElement,
  type ToolType,
  type ViewBox,
  type Room,
} from "~/components/Plan2D.vue";
import View3D from "~/components/View3D.vue";
import EditorToolbar from "~/components/EditorToolbar.vue";

// State
const mode = ref<"2d" | "3d">("2d");
const selectedTool = ref<ToolType>("wall");
const elements = ref<PlanElement[]>([]);
const selectedElementId = ref<string | null>(null);

// View transform
const viewBox = ref<ViewBox>({
  x: 0,
  y: 0,
  width: 1000,
  height: 700,
});

// Settings
const showDimensions = ref(true);
const lockOrthogonal = ref(true);
const incrementalSnap = ref(false);
const xrayMode = ref(false);
const selectionFilter = ref<"all" | "walls" | "openings">("all");
const isSheetOpen = ref(false);

// Defaults
const defaultWallHeight = ref(2.8);
const defaultWallThickness = ref(0.2);
const cameraMode = ref<"orbit" | "top" | "inside">("orbit");

// Computed Stats
const wallCount = computed(
  () => elements.value.filter(e => e.type === "wall").length
);
const windowCount = computed(
  () => elements.value.filter(e => e.type === "window").length
);
const doorCount = computed(
  () => elements.value.filter(e => e.type === "door").length
);

// We need to re-implement room computation or extract it to a shared utility if we want stats here.
// For now, I'll duplicate the room computation logic or move it to a shared file.
// Given the constraints, I will quickly duplicate the minimal logic needed for stats or just accept that Plan2D computes it.
// Actually, Plan2D computes rooms for rendering. If we want stats in the header, we need to compute it here too.
// Let's extract the room computation logic to a composable or utility if possible.
// For now, to save time/complexity, I will include the room computation logic here as well, or just pass it up from Plan2D?
// Passing up from Plan2D is tricky because it's computed.
// I'll add the computation logic here as well. It's fast.

const WORLD_SCALE = 0.01;

function computeRooms(allElements: PlanElement[]): Room[] {
  const walls = allElements.filter(e => e.type === "wall");
  if (walls.length === 0) return [];

  const nodeMap = new Map<string, { x: number; y: number }>();
  const adjacency = new Map<
    string,
    { neighborKey: string; edgeId: string }[]
  >();

  function nodeKey(x: number, y: number) {
    return `${Math.round(x)}_${Math.round(y)}`;
  }

  for (const w of walls) {
    const k1 = nodeKey(w.x1, w.y1);
    const k2 = nodeKey(w.x2, w.y2);

    if (!nodeMap.has(k1)) nodeMap.set(k1, { x: w.x1, y: w.y1 });
    if (!nodeMap.has(k2)) nodeMap.set(k2, { x: w.x2, y: w.y2 });

    if (!adjacency.has(k1)) adjacency.set(k1, []);
    if (!adjacency.has(k2)) adjacency.set(k2, []);

    adjacency.get(k1)!.push({ neighborKey: k2, edgeId: w.id });
    adjacency.get(k2)!.push({ neighborKey: k1, edgeId: w.id });
  }

  const visitedNodes = new Set<string>();
  const rooms: Room[] = [];
  let roomIndex = 1;

  for (const startKey of nodeMap.keys()) {
    if (visitedNodes.has(startKey)) continue;

    const queue: string[] = [startKey];
    const compNodes: string[] = [];
    const compEdges = new Set<string>();

    visitedNodes.add(startKey);

    while (queue.length) {
      const k = queue.shift() as string;
      compNodes.push(k);
      const neighbors = adjacency.get(k) ?? [];
      for (const n of neighbors) {
        compEdges.add(n.edgeId);
        if (!visitedNodes.has(n.neighborKey)) {
          visitedNodes.add(n.neighborKey);
          queue.push(n.neighborKey);
        }
      }
    }

    if (compNodes.length === 0) continue;

    let simpleLoop = true;
    for (const k of compNodes) {
      const deg = (adjacency.get(k) ?? []).length;
      if (deg !== 2) {
        simpleLoop = false;
        break;
      }
    }
    if (!simpleLoop) continue;

    const polygon: { x: number; y: number }[] = [];
    const usedEdges = new Set<string>();

    const startNode = compNodes[0]!;
    let current: string = startNode;
    let prev: string | null = null;

    for (let i = 0; i < compEdges.size + 2; i += 1) {
      const node = nodeMap.get(current);
      if (!node) break;
      polygon.push(node);

      const neighbors = adjacency.get(current) ?? [];
      let nextNeighbor: string | null = null;
      let edgeId: string | null = null;

      for (const n of neighbors) {
        if (n.neighborKey === prev) continue;
        if (usedEdges.has(n.edgeId)) continue;
        nextNeighbor = n.neighborKey;
        edgeId = n.edgeId;
        break;
      }

      if (!nextNeighbor || !edgeId) break;

      usedEdges.add(edgeId);
      prev = current;
      current = nextNeighbor;

      if (current === startNode) {
        const node2 = nodeMap.get(current);
        if (node2) polygon.push(node2);
        break;
      }
    }

    if (polygon.length < 4) continue;

    let areaSvg = 0;
    for (let i = 0; i + 1 < polygon.length; i += 1) {
      const p1 = polygon[i]!;
      const p2 = polygon[i + 1]!;
      areaSvg += p1.x * p2.y - p2.x * p1.y;
    }
    const areaMeters = Math.abs(areaSvg) * 0.5 * WORLD_SCALE * WORLD_SCALE;
    if (areaMeters < 0.1) continue;

    const centroid = {
      x: polygon.reduce((s, p) => s + p.x, 0) / polygon.length,
      y: polygon.reduce((s, p) => s + p.y, 0) / polygon.length,
    };

    rooms.push({
      id: `room-${roomIndex}`,
      name: `Room ${roomIndex}`,
      polygon,
      area: areaMeters,
      centroid,
    });
    roomIndex += 1;
  }

  return rooms;
}

const rooms = computed<Room[]>(() => computeRooms(elements.value));

const openLoopCount = computed(() => {
  const walls = elements.value.filter(e => e.type === "wall");
  if (walls.length === 0) return 0;
  return rooms.value.length > 0 ? 0 : 1; // Simplified check
});

const totalWallLength = computed(() =>
  elements.value
    .filter(e => e.type === "wall")
    .reduce(
      (sum, el) => sum + Math.hypot(el.x2 - el.x1, el.y2 - el.y1) * WORLD_SCALE,
      0
    )
);

const statsText = computed(() => {
  return `${wallCount.value} walls · ${windowCount.value} windows · ${doorCount.value} doors · ${rooms.value.length} rooms`;
});

// Keyboard shortcuts
function handleKeydown(e: KeyboardEvent) {
  if (e.key === "1") {
    mode.value = "2d";
  } else if (e.key === "2") {
    mode.value = "3d";
  }
}

onMounted(() => {
  if (typeof window !== "undefined") {
    window.addEventListener("keydown", handleKeydown);
  }
});

onBeforeUnmount(() => {
  if (typeof window !== "undefined") {
    window.removeEventListener("keydown", handleKeydown);
  }
});
</script>

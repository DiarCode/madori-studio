<template>
  <div class="flex flex-col bg-black min-h-screen text-white">
    <!-- Header -->
    <header
      class="flex justify-between items-center gap-4 px-6 py-3 border-white/10 border-b"
    >
      <div class="flex items-center gap-3">
        <div
          class="flex justify-center items-center border border-white/50 rounded-full w-9 h-9 font-semibold text-sm tracking-widest"
        >
          3D
        </div>
        <div>
          <h1 class="font-semibold text-2xl uppercase tracking-tight">
            Interior Studio
          </h1>
          <p class="text-white/60 text-sm">
            Plan → precise walls → full-screen 3D shell.
          </p>
        </div>
      </div>

      <div class="flex items-center gap-3 text-xs">
        <span class="text-white/60">
          {{ wallCount }} walls · {{ windowCount }} windows ·
          {{ doorCount }} doors · {{ rooms.length }} rooms
        </span>

        <Button
          variant="outline"
          class="px-4 border-white/40 rounded-full h-9 text-white text-xs uppercase tracking-[0.18em]"
          @click="isSheetOpen = true"
        >
          Project panel
        </Button>
      </div>
    </header>

    <!-- Main full-screen workspace -->
    <main class="relative flex-1 overflow-hidden">
      <!-- 2D workspace -->
      <div v-if="mode === '2d'" class="absolute inset-0 bg-black">
        <div class="absolute inset-0 floor-dot-grid pointer-events-none" />

        <svg
          ref="svgRef"
          :viewBox="`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`"
          preserveAspectRatio="xMidYMid meet"
          class="z-10 relative bg-transparent w-full h-full touch-none select-none"
          @pointerdown.prevent="onPointerDown"
          @pointermove.prevent="onPointerMove"
          @pointerup.prevent="onPointerUp"
          @pointerleave.prevent="onPointerUp"
          @wheel.prevent="onWheel"
          @contextmenu.prevent
        >
          <!-- Rooms (soft fill + area label) -->
          <g>
            <template v-for="room in rooms" :key="room.id">
              <polygon
                :points="roomPolygonPoints(room)"
                fill="#ffffff"
                fill-opacity="0.04"
                stroke="none"
                pointer-events="none"
              />
              <text
                :x="room.centroid.x"
                :y="room.centroid.y"
                text-anchor="middle"
                alignment-baseline="middle"
                class="room-label"
              >
                {{ room.name }} · {{ room.area.toFixed(2) }} m²
              </text>
            </template>
          </g>

          <!-- Elements -->
          <g>
            <template
              v-for="element in effectiveElements"
              :key="element.id + (element === currentElement ? '-temp' : '')"
            >
              <!-- selection highlight -->
              <line
                v-if="element.id === selectedElementId"
                :x1="element.x1"
                :y1="element.y1"
                :x2="element.x2"
                :y2="element.y2"
                stroke="#ffffff"
                :stroke-width="strokeWidth(element) + 8"
                stroke-linecap="round"
                stroke-opacity="0.12"
              />
              <!-- main stroke -->
              <line
                :x1="element.x1"
                :y1="element.y1"
                :x2="element.x2"
                :y2="element.y2"
                :stroke="strokeFor(element.type)"
                :stroke-width="strokeWidth(element)"
                stroke-linecap="round"
                :stroke-opacity="element.id === selectedElementId ? 1 : 0.9"
                @dblclick.stop="toggleIsolate(element.id)"
              />
              <!-- endpoints / handles -->
              <circle
                :cx="element.x1"
                :cy="element.y1"
                :r="element.id === selectedElementId ? 11 : 9"
                class="handle"
                :class="{ 'handle--active': element.id === selectedElementId }"
              />
              <circle
                :cx="element.x2"
                :cy="element.y2"
                :r="element.id === selectedElementId ? 11 : 9"
                class="handle"
                :class="{ 'handle--active': element.id === selectedElementId }"
              />

              <!-- dimension label (walls only) -->
              <g
                v-if="showDimensions && element.type === 'wall'"
                class="pointer-events-auto"
              >
                <text
                  :transform="wallLabelTransform(element)"
                  text-anchor="middle"
                  alignment-baseline="middle"
                  class="dimension-text"
                  @dblclick.stop="onDimensionDblClick(element, $event)"
                >
                  {{ wallLabelText(element) }}
                </text>
              </g>
            </template>
          </g>
        </svg>

        <!-- Length HUD while drawing -->
        <div
          v-if="
            isDrawing && currentElement && currentElement.type !== 'measure'
          "
          class="bottom-20 left-1/2 fixed flex items-center gap-2 bg-white/90 shadow-md px-3 py-1.5 border border-black/30 rounded-full text-[11px] -translate-x-1/2 pointer-events-auto"
        >
          <span class="text-black/60 uppercase tracking-[0.18em]">Length</span>
          <input
            v-model="drawLengthInput"
            type="number"
            step="0.05"
            class="bg-transparent border-none outline-none w-20 text-xs text-right"
            @focus="isEditingDrawLength = true"
            @blur="isEditingDrawLength = false"
            @keydown.stop.prevent.enter="applyDrawLength"
            @keydown.stop.esc="cancelDrawLengthEdit"
          />
          <span class="text-[11px] text-black/40">m</span>
        </div>

        <!-- Inline dimension editor (double-click label) -->
        <div
          v-if="dimensionEdit"
          class="z-50 fixed"
          :style="{
            left: dimensionEdit.clientX + 8 + 'px',
            top: dimensionEdit.clientY + 8 + 'px',
          }"
        >
          <div
            class="flex items-center gap-1 bg-white shadow-md px-3 py-1 border border-black/40 rounded-full"
          >
            <input
              v-model="dimensionEdit.value"
              type="number"
              step="0.01"
              class="bg-transparent outline-none w-20 text-xs text-right"
              @keydown.stop.prevent.enter="applyDimensionEdit"
              @keydown.stop.esc="cancelDimensionEdit"
              autofocus
            />
            <span class="text-[11px] text-black/50">m</span>
          </div>
        </div>
      </div>

      <!-- 3D workspace -->
      <div v-else class="absolute inset-0">
        <ClientOnly>
          <div class="relative w-full h-full">
            <Suspense>
              <TresCanvas clear-color="#000000" class="absolute inset-0">
                <TresPerspectiveCamera
                  :position="cameraPosition"
                  :fov="cameraFov"
                />
                <OrbitControls :enable-damping="true" :target="orbitTarget" />

                <TresAmbientLight :intensity="0.6" />
                <TresDirectionalLight :position="[6, 10, 8]" :intensity="0.9" />

                <!-- Floor -->
                <TresMesh :rotation="[-Math.PI / 2, 0, 0]">
                  <TresPlaneGeometry :args="[30, 30, 40, 40]" />
                  <TresMeshStandardMaterial
                    color="#050505"
                    :wireframe="false"
                    :roughness="0.9"
                    :metalness="0.0"
                  />
                </TresMesh>

                <!-- Walls -->
                <TresMesh
                  v-for="mesh in wallMeshes"
                  :key="mesh.id"
                  :position="mesh.position"
                  :rotation="mesh.rotation"
                >
                  <TresBoxGeometry
                    :args="[mesh.length, mesh.height, mesh.thickness]"
                  />
                  <TresMeshStandardMaterial
                    color="#ffffff"
                    :roughness="0.6"
                    :metalness="0.1"
                    :transparent="true"
                    :opacity="xrayMode ? 0.35 : 1"
                  />
                </TresMesh>

                <!-- Openings -->
                <TresMesh
                  v-for="mesh in openingMeshes"
                  :key="mesh.id"
                  :position="mesh.position"
                  :rotation="mesh.rotation"
                >
                  <TresBoxGeometry
                    :args="[mesh.length, mesh.height, mesh.thickness]"
                  />
                  <TresMeshStandardMaterial
                    :color="mesh.type === 'window' ? '#f5f5f5' : '#d4d4d4'"
                    :roughness="0.3"
                    :metalness="0.2"
                    :transparent="true"
                    :opacity="xrayMode ? 0.6 : 1"
                  />
                </TresMesh>
              </TresCanvas>
            </Suspense>

            <!-- 3D view hint -->
            <div class="top-4 left-6 absolute text-xs">
              <p class="font-medium text-white/80 uppercase tracking-[0.16em]">
                3D orbit view
              </p>
              <p class="text-white/60">
                Drag to orbit, scroll to zoom, right-click to pan.
              </p>
            </div>
          </div>
        </ClientOnly>
      </div>

      <!-- Bottom tool tabbar (on top of everything) -->
      <div class="bottom-4 z-50 absolute inset-x-0 flex justify-center">
        <div
          class="flex items-center gap-3 bg-black shadow-xl px-4 py-2 border border-white/10 rounded-full text-[12px] text-white md:text-[13px]"
        >
          <!-- 2D/3D mode -->
          <div class="flex items-center gap-1">
            <button
              type="button"
              class="flex items-center gap-1 px-2.5 py-1 rounded-full uppercase tracking-[0.16em]"
              :class="
                mode === '2d'
                  ? 'bg-white text-black'
                  : 'bg-white/10 text-white/70'
              "
              @click="mode = '2d'"
            >
              <Square class="w-4 h-4" />
              <span>2D</span>
            </button>
            <button
              type="button"
              class="flex items-center gap-1 px-2.5 py-1 rounded-full uppercase tracking-[0.16em]"
              :class="
                mode === '3d'
                  ? 'bg-white text-black'
                  : 'bg-white/10 text-white/70'
              "
              @click="mode = '3d'"
            >
              <PanelsTopLeft class="w-4 h-4" />
              <span>3D</span>
            </button>
          </div>

          <span class="bg-white/25 w-px h-5" />

          <!-- Tools -->
          <div class="flex items-center gap-1">
            <button
              v-for="tool in tools"
              :key="tool.value"
              type="button"
              class="flex items-center gap-1 px-2.5 py-1 rounded-full uppercase tracking-[0.16em]"
              :class="toolButtonClass(tool.value)"
              @click="selectedTool = tool.value"
            >
              <component :is="toolIcon(tool.value)" class="w-4 h-4" />
              <span>{{ tool.label }}</span>
            </button>
          </div>

          <span class="bg-white/25 w-px h-5" />

          <!-- Toggles -->
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="flex items-center gap-1 px-2 py-1 rounded-full"
              :class="
                showDimensions
                  ? 'bg-white text-black'
                  : 'bg-white/10 text-white/70'
              "
              @click="showDimensions = !showDimensions"
            >
              <Ruler class="w-3 h-3" />
              <span>Dims</span>
            </button>
            <button
              type="button"
              class="flex items-center gap-1 px-2 py-1 rounded-full"
              :class="
                lockOrthogonal
                  ? 'bg-white text-black'
                  : 'bg-white/10 text-white/70'
              "
              @click="lockOrthogonal = !lockOrthogonal"
            >
              <Square class="w-3 h-3" />
              <span>90°</span>
            </button>
            <button
              type="button"
              class="flex items-center gap-1 px-2 py-1 rounded-full"
              :class="
                incrementalSnap
                  ? 'bg-white text-black'
                  : 'bg-white/10 text-white/70'
              "
              @click="incrementalSnap = !incrementalSnap"
            >
              <PanelsTopLeft class="w-3 h-3" />
              <span>Snap 0.5m</span>
            </button>
            <button
              type="button"
              class="flex items-center gap-1 px-2 py-1 rounded-full"
              :class="
                xrayMode ? 'bg-white text-black' : 'bg-white/10 text-white/70'
              "
              @click="xrayMode = !xrayMode"
            >
              <Eye class="w-3 h-3" />
              <span>X-ray</span>
            </button>

            <!-- Selection filter -->
            <select
              v-model="selectionFilter"
              class="bg-white/10 ml-1 px-2 py-1 border border-white/20 rounded-full focus:outline-none text-[11px] text-white"
            >
              <option value="all">All</option>
              <option value="walls">Walls</option>
              <option value="openings">Openings</option>
            </select>
          </div>

          <span class="bg-white/25 w-px h-5" />

          <div class="opacity-80 text-[10px] md:text-[11px]">
            {{ wallCount }} walls · {{ windowCount }} windows ·
            {{ doorCount }} doors · {{ rooms.length }} rooms
          </div>
        </div>
      </div>
    </main>

    <!-- Config / project sheet -->
    <Sheet v-model:open="isSheetOpen">
      <SheetContent
        side="right"
        class="bg-black border-white/10 border-l w-[360px] text-white"
      >
        <SheetHeader>
          <SheetTitle class="text-white/80 text-xs uppercase tracking-[0.18em]">
            Project panel
          </SheetTitle>
          <SheetDescription class="text-white/60 text-xs">
            Global parameters, bill of materials, and model audit.
          </SheetDescription>
        </SheetHeader>

        <div class="space-y-6 mt-4 text-sm">
          <!-- Global parameters -->
          <section class="space-y-2">
            <p
              class="font-medium text-white/60 text-xs uppercase tracking-[0.16em]"
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
                    class="bg-transparent px-2 py-1 border border-white/30 rounded w-20 text-white text-xs text-right placeholder-white/40"
                  />
                  <span class="text-white/50 text-xs">m</span>
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
                    class="bg-transparent px-2 py-1 border border-white/30 rounded w-20 text-white text-xs text-right placeholder-white/40"
                  />
                  <span class="text-white/50 text-xs">m</span>
                </div>
              </div>
            </div>
          </section>

          <!-- BOM -->
          <section class="space-y-2">
            <p
              class="font-medium text-white/60 text-xs uppercase tracking-[0.16em]"
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
              class="font-medium text-white/60 text-xs uppercase tracking-[0.16em]"
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
import { computed, ref, onMounted, onBeforeUnmount, type Ref } from "vue";
import { nanoid } from "nanoid";
import { OrbitControls } from "@tresjs/cientos";

import { Button } from "~/core/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "~/core/components/ui/sheet";

import {
  MousePointer2,
  Ruler,
  Square,
  PanelsTopLeft,
  DoorOpen,
  Eye,
} from "lucide-vue-next";

type Mode = "2d" | "3d";
type ToolType = "select" | "wall" | "window" | "door" | "measure";

interface PlanElement {
  id: string;
  type: ToolType;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  height: number; // meters
  thickness: number; // meters
  attachedWallId?: string | null; // only for windows/doors
}

interface WallMesh {
  id: string;
  length: number;
  height: number;
  thickness: number;
  position: [number, number, number];
  rotation: [number, number, number];
}

interface OpeningMesh extends WallMesh {
  type: ToolType;
}

interface Room {
  id: string;
  name: string;
  polygon: { x: number; y: number }[];
  area: number;
  centroid: { x: number; y: number };
}

interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PlanBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const VIEWBOX_WIDTH = 1000;
const VIEWBOX_HEIGHT = 700;
const HANDLE_RADIUS = 16;
const SNAP_RADIUS = 30;
const WORLD_SCALE = 0.01; // 1 SVG unit => 0.01 meters
const WALL_ATTACH_RADIUS = 30;
const SNAP_STEP_METERS = 0.5;

const mode = ref<Mode>("2d");

const tools: { value: ToolType; label: string }[] = [
  { value: "select", label: "Select" },
  { value: "wall", label: "Wall" },
  { value: "window", label: "Window" },
  { value: "door", label: "Door" },
  { value: "measure", label: "Measure" },
];

const selectedTool = ref<ToolType>("wall");

// Global defaults
const defaultWallHeight = ref(2.8);
const defaultWallThickness = ref(0.2);

// Plan state
const elements = ref<PlanElement[]>([]);
const currentElement = ref<PlanElement | null>(null);
const isDrawing = ref(false);

const svgRef: Ref<SVGSVGElement | null> = ref(null);
const selectedElementId = ref<string | null>(null);
const draggingHandle = ref<"start" | "end" | null>(null);

// View transform (pan / zoom)
const viewBox = ref<ViewBox>({
  x: 0,
  y: 0,
  width: VIEWBOX_WIDTH,
  height: VIEWBOX_HEIGHT,
});
const isPanning = ref(false);
const panStart = ref<{ x: number; y: number } | null>(null);
const panViewBoxStart = ref<ViewBox | null>(null);

// Toggles
const showDimensions = ref(true);
const lockOrthogonal = ref(true);
const incrementalSnap = ref(false); // default OFF so walls follow cursor exactly
const xrayMode = ref(false);

// Selection filter & isolate
const selectionFilter = ref<"all" | "walls" | "openings">("all");
const isolatedElementIds = ref<string[] | null>(null);

// 3D camera
const cameraMode = ref<"orbit" | "top" | "inside">("orbit");

// Sheet
const isSheetOpen = ref(false);

// Drawing HUD
const drawLengthInput = ref("0.00");
const isEditingDrawLength = ref(false);

// Inline dimension editor
const dimensionEdit = ref<{
  elementId: string;
  value: string;
  clientX: number;
  clientY: number;
} | null>(null);

// Stats
const wallCount = computed(
  () => elements.value.filter(e => e.type === "wall").length
);
const windowCount = computed(
  () => elements.value.filter(e => e.type === "window").length
);
const doorCount = computed(
  () => elements.value.filter(e => e.type === "door").length
);

// Elements used for rendering (respect isolate)
const effectiveElements = computed<PlanElement[]>(() => {
  const base = currentElement.value
    ? [...elements.value, currentElement.value]
    : elements.value;
  if (!isolatedElementIds.value || isolatedElementIds.value.length === 0) {
    return base;
  }
  const set = new Set(isolatedElementIds.value);
  return base.filter(e => set.has(e.id));
});

// 3D meshes from persistent elements (not including current drawing segment)
const baseElements = computed(() => {
  if (!isolatedElementIds.value || isolatedElementIds.value.length === 0) {
    return elements.value;
  }
  const set = new Set(isolatedElementIds.value);
  return elements.value.filter(e => set.has(e.id));
});

const planBounds = computed<PlanBounds | null>(() => {
  if (baseElements.value.length === 0) {
    return null;
  }
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const element of baseElements.value) {
    minX = Math.min(minX, element.x1, element.x2);
    maxX = Math.max(maxX, element.x1, element.x2);
    minY = Math.min(minY, element.y1, element.y2);
    maxY = Math.max(maxY, element.y1, element.y2);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return null;
  }

  return { minX, maxX, minY, maxY };
});

const planCenter = computed(() => {
  const bounds = planBounds.value;
  if (!bounds) {
    return { x: VIEWBOX_WIDTH / 2, y: VIEWBOX_HEIGHT / 2 };
  }
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
});

const planSpanMeters = computed(() => {
  const bounds = planBounds.value;
  if (!bounds) {
    return Math.max(VIEWBOX_WIDTH, VIEWBOX_HEIGHT) * WORLD_SCALE;
  }
  const spanX = bounds.maxX - bounds.minX;
  const spanY = bounds.maxY - bounds.minY;
  const span = Math.max(spanX, spanY);
  return Math.max(span * WORLD_SCALE, 1);
});

const wallMeshes = computed<WallMesh[]>(() =>
  baseElements.value
    .filter(e => e.type === "wall")
    .map(el => {
      const dx = el.x2 - el.x1;
      const dy = el.y2 - el.y1;
      const planarLength = Math.max(
        distance(el.x1, el.y1, el.x2, el.y2),
        0.001
      );

      const length = planarLength * WORLD_SCALE;
      const origin = planCenter.value;
      const angle = Math.atan2(dy, dx);

      return {
        id: el.id,
        length,
        height: el.height,
        thickness: el.thickness,
        position: [
          ((el.x1 + el.x2) / 2 - origin.x) * WORLD_SCALE,
          el.height / 2,
          ((el.y1 + el.y2) / 2 - origin.y) * WORLD_SCALE,
        ],
        rotation: [0, angle, 0],
      };
    })
);

const openingMeshes = computed<OpeningMesh[]>(() =>
  baseElements.value
    .filter(e => e.type === "window" || e.type === "door")
    .map(el => {
      const dx = el.x2 - el.x1;
      const dy = el.y2 - el.y1;
      const planarLength = Math.max(
        distance(el.x1, el.y1, el.x2, el.y2),
        0.001
      );

      const length = planarLength * WORLD_SCALE;
      const origin = planCenter.value;
      const angle = Math.atan2(dy, dx);

      const isWindow = el.type === "window";
      const height = isWindow ? 1.2 : 2.1;
      const thickness = Math.max(el.thickness * 0.6, 0.08);
      const yCenter = isWindow ? 1.4 : height / 2;

      return {
        id: el.id,
        type: el.type,
        length,
        height,
        thickness,
        position: [
          ((el.x1 + el.x2) / 2 - origin.x) * WORLD_SCALE,
          yCenter,
          ((el.y1 + el.y2) / 2 - origin.y) * WORLD_SCALE,
        ],
        rotation: [0, angle, 0],
      };
    })
);

// Rooms (closed wall loops)
const rooms = computed<Room[]>(() => computeRooms(elements.value));
const openLoopCount = computed(() => {
  const { openLoops } = analyzeWallLoops(elements.value);
  return openLoops;
});

// Total wall length for BOM
const totalWallLength = computed(() =>
  elements.value
    .filter(e => e.type === "wall")
    .reduce(
      (sum, el) => sum + distance(el.x1, el.y1, el.x2, el.y2) * WORLD_SCALE,
      0
    )
);

// Camera helpers
const cameraPosition = computed<[number, number, number]>(() => {
  const distance = Math.max(planSpanMeters.value * 0.9, 12);
  switch (cameraMode.value) {
    case "top":
      return [0, Math.max(distance, 16), 0.01];
    case "inside":
      return [0, 1.7, Math.max(distance * 0.25, 4)];
    case "orbit":
    default:
      return [0, distance * 0.45, distance];
  }
});

const orbitTarget = computed<[number, number, number]>(() => {
  const y = Math.min(2.6, Math.max(planSpanMeters.value * 0.04, 1.2));
  return [0, y, 0];
});

const cameraFov = computed(() => {
  return cameraMode.value === "top" ? 38 : 45;
});

// UI helpers
function toolButtonClass(tool: ToolType) {
  const isActive = selectedTool.value === tool;
  return isActive ? "bg-white text-black" : "bg-white/10 text-white/70";
}

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

function strokeFor(type: ToolType) {
  if (type === "wall") return "#ffffff";
  if (type === "window") return "rgba(255, 255, 255, 0.85)";
  if (type === "door") return "rgba(255, 255, 255, 0.65)";
  if (type === "measure") return "rgba(255, 255, 255, 0.5)";
  return "#ffffff";
}

function strokeWidth(element: PlanElement) {
  const base = 4;
  return base + element.thickness * 20;
}

// Math & transforms
function svgCoords(event: PointerEvent | WheelEvent) {
  const svg = svgRef.value;
  if (!svg) return { x: 0, y: 0 };

  const rect = svg.getBoundingClientRect();
  const vb = viewBox.value;
  const viewRatio = vb.width / vb.height;
  const rectRatio = rect.width / rect.height;

  let drawWidth = rect.width;
  let drawHeight = rect.height;
  let offsetX = 0;
  let offsetY = 0;

  if (rectRatio > viewRatio) {
    drawHeight = rect.height;
    drawWidth = drawHeight * viewRatio;
    offsetX = (rect.width - drawWidth) / 2;
  } else {
    drawWidth = rect.width;
    drawHeight = drawWidth / viewRatio;
    offsetY = (rect.height - drawHeight) / 2;
  }

  const relX = clamp(event.clientX - rect.left - offsetX, 0, drawWidth);
  const relY = clamp(event.clientY - rect.top - offsetY, 0, drawHeight);

  return {
    x: vb.x + (relX / drawWidth) * vb.width,
    y: vb.y + (relY / drawHeight) * vb.height,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function distance(x1: number, y1: number, x2: number, y2: number) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function projectPointOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const abLen2 = abx * abx + aby * aby;
  if (abLen2 === 0) return { x: ax, y: ay, t: 0 };
  let t = (apx * abx + apy * aby) / abLen2;
  t = Math.max(0, Math.min(1, t));
  return { x: ax + t * abx, y: ay + t * aby, t };
}

function distancePointToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
) {
  const proj = projectPointOnSegment(px, py, x1, y1, x2, y2);
  return distance(px, py, proj.x, proj.y);
}

// Snapping
function snapToExisting(x: number, y: number, ignoreId?: string) {
  let bestX = x;
  let bestY = y;
  let bestDist = SNAP_RADIUS;

  for (const el of elements.value) {
    if (ignoreId && el.id === ignoreId) continue;

    const endpoints: [number, number][] = [
      [el.x1, el.y1],
      [el.x2, el.y2],
    ];

    for (const [px, py] of endpoints) {
      const d = distance(x, y, px, py);
      if (d < bestDist) {
        bestDist = d;
        bestX = px;
        bestY = py;
      }
    }
  }

  return { x: bestX, y: bestY };
}

function findClosestWallProjection(x: number, y: number) {
  let bestWall: PlanElement | null = null;
  let bestPoint = { x, y, t: 0 };
  let bestDist = WALL_ATTACH_RADIUS;

  for (const el of elements.value) {
    if (el.type !== "wall") continue;
    const proj = projectPointOnSegment(x, y, el.x1, el.y1, el.x2, el.y2);
    const d = distance(x, y, proj.x, proj.y);
    if (d < bestDist) {
      bestDist = d;
      bestWall = el;
      bestPoint = proj;
    }
  }

  if (!bestWall) return null;
  return { wall: bestWall, point: bestPoint };
}

function getWallById(id: string | undefined | null) {
  if (!id) return null;
  return elements.value.find(e => e.id === id && e.type === "wall") ?? null;
}

// Orthogonal lock
function applyOrthogonal(
  anchorX: number,
  anchorY: number,
  x: number,
  y: number
) {
  if (!lockOrthogonal.value) {
    return { x, y };
  }
  const dx = x - anchorX;
  const dy = y - anchorY;
  if (Math.abs(dx) > Math.abs(dy)) {
    return { x, y: anchorY };
  }
  return { x: anchorX, y };
}

// Incremental length snap
function applyIncrementalSnap(
  anchorX: number,
  anchorY: number,
  x: number,
  y: number
) {
  if (!incrementalSnap.value) {
    return { x, y };
  }
  const dx = x - anchorX;
  const dy = y - anchorY;
  const rawLen = Math.max(distance(anchorX, anchorY, x, y), 0.0001);
  const rawMeters = rawLen * WORLD_SCALE;
  const snappedMeters =
    Math.round(rawMeters / SNAP_STEP_METERS) * SNAP_STEP_METERS;
  if (snappedMeters <= 0) {
    return { x: anchorX, y: anchorY };
  }
  const newLenSvg = snappedMeters / WORLD_SCALE;
  const scale = newLenSvg / rawLen;
  return {
    x: anchorX + dx * scale,
    y: anchorY + dy * scale,
  };
}

// Selection filter
function canSelectElement(el: PlanElement) {
  if (selectionFilter.value === "all") return true;
  if (selectionFilter.value === "walls") return el.type === "wall";
  if (selectionFilter.value === "openings")
    return el.type === "window" || el.type === "door";
  return true;
}

// Handle hit-test
function findHandleAt(x: number, y: number) {
  for (let i = elements.value.length - 1; i >= 0; i -= 1) {
    const el = elements.value[i];
    if (!el) continue;
    if (!canSelectElement(el)) continue;

    const dStart = distance(x, y, el.x1, el.y1);
    if (dStart <= HANDLE_RADIUS) {
      return { id: el.id, handle: "start" as const };
    }
    const dEnd = distance(x, y, el.x2, el.y2);
    if (dEnd <= HANDLE_RADIUS) {
      return { id: el.id, handle: "end" as const };
    }
  }
  return null;
}

function findNearestElement(x: number, y: number) {
  let bestEl: PlanElement | null = null;
  let bestDist = HANDLE_RADIUS + 6;

  for (const el of elements.value) {
    if (!canSelectElement(el)) continue;
    const d = distancePointToSegment(x, y, el.x1, el.y1, el.x2, el.y2);
    if (d < bestDist) {
      bestDist = d;
      bestEl = el;
    }
  }
  return bestEl;
}

// Pointer handlers
function onPointerDown(event: PointerEvent) {
  // Right button: pan
  if (event.button === 2) {
    isPanning.value = true;
    panStart.value = { x: event.clientX, y: event.clientY };
    panViewBoxStart.value = { ...viewBox.value };
    return;
  }

  if (mode.value !== "2d") return;

  const { x, y } = svgCoords(event);

  // Select tool
  if (selectedTool.value === "select") {
    const handleHit = findHandleAt(x, y);
    if (handleHit) {
      selectedElementId.value = handleHit.id;
      draggingHandle.value = handleHit.handle;
    } else {
      const el = findNearestElement(x, y);
      selectedElementId.value = el ? el.id : null;
      draggingHandle.value = null;
    }
    isDrawing.value = false;
    currentElement.value = null;
    return;
  }

  if (selectedTool.value === "measure") {
    currentElement.value = {
      id: nanoid(),
      type: "measure",
      x1: x,
      y1: y,
      x2: x,
      y2: y,
      height: 0,
      thickness: 0.05,
    };
    isDrawing.value = true;
    selectedElementId.value = null;
    draggingHandle.value = null;
    drawLengthInput.value = "0.00";
    return;
  }

  selectedElementId.value = null;

  const hit = findHandleAt(x, y);
  if (hit) {
    selectedElementId.value = hit.id;
    draggingHandle.value = hit.handle;
    isDrawing.value = false;
    currentElement.value = null;
    return;
  }

  let startX = x;
  let startY = y;
  let attachedWallId: string | undefined;

  if (selectedTool.value === "window" || selectedTool.value === "door") {
    const attach = findClosestWallProjection(x, y);
    if (!attach) return;
    attachedWallId = attach.wall.id;
    startX = attach.point.x;
    startY = attach.point.y;
  } else {
    const snappedStart = snapToExisting(x, y);
    startX = snappedStart.x;
    startY = snappedStart.y;
  }

  const element: PlanElement = {
    id: nanoid(),
    type: selectedTool.value,
    x1: startX,
    y1: startY,
    x2: startX,
    y2: startY,
    height: defaultWallHeight.value,
    thickness: defaultWallThickness.value,
    attachedWallId,
  };

  currentElement.value = element;
  isDrawing.value = true;
  selectedElementId.value = element.id;
  draggingHandle.value = null;
  drawLengthInput.value = "0.00";
}

function onPointerMove(event: PointerEvent) {
  if (mode.value !== "2d") return;

  if (isPanning.value && panStart.value && panViewBoxStart.value) {
    const svg = svgRef.value;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const dxPixels = event.clientX - panStart.value.x;
    const dyPixels = event.clientY - panStart.value.y;
    const vb = panViewBoxStart.value;
    const dxWorld = (dxPixels / rect.width) * vb.width;
    const dyWorld = (dyPixels / rect.height) * vb.height;
    viewBox.value = {
      ...vb,
      x: vb.x - dxWorld,
      y: vb.y - dyWorld,
    };
    return;
  }

  const { x, y } = svgCoords(event);

  // Measurement tool
  if (
    isDrawing.value &&
    currentElement.value &&
    currentElement.value.type === "measure"
  ) {
    currentElement.value = {
      ...currentElement.value,
      x2: x,
      y2: y,
    };
    const len =
      distance(
        currentElement.value.x1,
        currentElement.value.y1,
        currentElement.value.x2,
        currentElement.value.y2
      ) * WORLD_SCALE;
    if (!isEditingDrawLength.value) {
      drawLengthInput.value = len.toFixed(2);
    }
    return;
  }

  // Dragging existing endpoint
  if (draggingHandle.value && selectedElementId.value) {
    const idx = elements.value.findIndex(e => e.id === selectedElementId.value);
    if (idx !== -1) {
      const el = elements.value[idx];
      if (!el) {
        return;
      }

      if (el.type === "window" || el.type === "door") {
        const wall = getWallById(el.attachedWallId ?? undefined);
        if (wall) {
          const proj = projectPointOnSegment(
            x,
            y,
            wall.x1,
            wall.y1,
            wall.x2,
            wall.y2
          );
          if (draggingHandle.value === "start") {
            el.x1 = proj.x;
            el.y1 = proj.y;
          } else {
            el.x2 = proj.x;
            el.y2 = proj.y;
          }
        }
      } else {
        const snapped = snapToExisting(x, y, el.id);
        const anchorX = draggingHandle.value === "start" ? el.x2 : el.x1;
        const anchorY = draggingHandle.value === "start" ? el.y2 : el.y1;
        let next = applyOrthogonal(anchorX, anchorY, snapped.x, snapped.y);
        next = applyIncrementalSnap(anchorX, anchorY, next.x, next.y);

        if (draggingHandle.value === "start") {
          el.x1 = next.x;
          el.y1 = next.y;
        } else {
          el.x2 = next.x;
          el.y2 = next.y;
        }
      }
    }
    return;
  }

  // Drawing new element
  if (!isDrawing.value || !currentElement.value) return;

  const el = currentElement.value;

  if (el.type === "window" || el.type === "door") {
    let targetX = x;
    let targetY = y;
    const wall = getWallById(el.attachedWallId ?? undefined);
    if (wall) {
      const proj = projectPointOnSegment(
        x,
        y,
        wall.x1,
        wall.y1,
        wall.x2,
        wall.y2
      );
      targetX = proj.x;
      targetY = proj.y;
    }
    currentElement.value = {
      ...el,
      x2: targetX,
      y2: targetY,
    };
  } else {
    const snapped = snapToExisting(x, y, el.id);
    let next = applyOrthogonal(el.x1, el.y1, snapped.x, snapped.y);
    next = applyIncrementalSnap(el.x1, el.y1, next.x, next.y);
    currentElement.value = {
      ...el,
      x2: next.x,
      y2: next.y,
    };
  }

  const lenMeters =
    distance(
      currentElement.value.x1,
      currentElement.value.y1,
      currentElement.value.x2,
      currentElement.value.y2
    ) * WORLD_SCALE;
  if (!isEditingDrawLength.value) {
    drawLengthInput.value = lenMeters.toFixed(2);
  }
}

function onPointerUp() {
  if (isPanning.value) {
    isPanning.value = false;
    panStart.value = null;
    panViewBoxStart.value = null;
  }

  if (
    isDrawing.value &&
    currentElement.value &&
    currentElement.value.type === "measure"
  ) {
    currentElement.value = null;
    isDrawing.value = false;
    return;
  }

  if (draggingHandle.value) {
    draggingHandle.value = null;
  }

  if (isDrawing.value && currentElement.value) {
    const el = currentElement.value;
    const len = distance(el.x1, el.y1, el.x2, el.y2);
    if (len > 10) {
      elements.value.push(el);
    }
  }

  isDrawing.value = false;
  currentElement.value = null;
}

// Wheel zoom
function onWheel(event: WheelEvent) {
  if (mode.value !== "2d") return;

  const direction = event.deltaY > 0 ? 1 : -1;
  const factor = direction > 0 ? 1.1 : 0.9;

  const vb = viewBox.value;
  const newWidth = clamp(vb.width * factor, 200, 8000);
  const ratio = VIEWBOX_HEIGHT / VIEWBOX_WIDTH;
  const newHeight = newWidth * ratio;

  const dx = (newWidth - vb.width) / 2;
  const dy = (newHeight - vb.height) / 2;

  viewBox.value = {
    x: vb.x - dx,
    y: vb.y - dy,
    width: newWidth,
    height: newHeight,
  };
}

// Room helpers
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

    // Check if component forms a simple loop: every node degree == 2
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

    // Compute area via shoelace (in meters²)
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

function analyzeWallLoops(allElements: PlanElement[]) {
  const detectedRooms = computeRooms(allElements);
  const walls = allElements.filter(e => e.type === "wall");
  if (walls.length === 0) return { openLoops: 0 };
  const openLoops = detectedRooms.length > 0 ? 0 : 1;
  return { openLoops };
}

// Room polygon points string
function roomPolygonPoints(room: Room) {
  return room.polygon.map(p => `${p.x},${p.y}`).join(" ");
}

// Dimension helpers
function wallLengthMeters(el: PlanElement) {
  const len = distance(el.x1, el.y1, el.x2, el.y2);
  return len * WORLD_SCALE;
}

function wallAngleDeg(el: PlanElement) {
  const dx = el.x2 - el.x1;
  const dy = el.y2 - el.y1;
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  angle = (angle + 360) % 180;
  return angle;
}

function wallLabelText(el: PlanElement) {
  const m = wallLengthMeters(el);
  const angle = wallAngleDeg(el);
  return `${m.toFixed(2)} m · ${angle.toFixed(0)}°`;
}

function wallLabelTransform(el: PlanElement) {
  const dx = el.x2 - el.x1;
  const dy = el.y2 - el.y1;
  const midX = (el.x1 + el.x2) / 2;
  const midY = (el.y1 + el.y2) / 2;
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;

  if (angle > 90 || angle < -90) {
    angle += 180;
  }

  const offset = 14;
  return `translate(${midX}, ${midY - offset}) rotate(${angle})`;
}

// Editing
function setElementLengthMeters(el: PlanElement, newLengthMeters: number) {
  if (newLengthMeters <= 0) return;
  const dx = el.x2 - el.x1;
  const dy = el.y2 - el.y1;
  const currentSvgLen = Math.max(distance(el.x1, el.y1, el.x2, el.y2), 0.0001);
  const newSvgLen = newLengthMeters / WORLD_SCALE;
  const scale = newSvgLen / currentSvgLen;
  el.x2 = el.x1 + dx * scale;
  el.y2 = el.y1 + dy * scale;
}

// Draw length HUD actions
function applyDrawLength() {
  if (!isDrawing.value || !currentElement.value) return;
  const val = parseFloat(drawLengthInput.value);
  if (!Number.isFinite(val) || val <= 0) return;
  const el = { ...currentElement.value };
  setElementLengthMeters(el, val);
  currentElement.value = el;
  isEditingDrawLength.value = false;
}

function cancelDrawLengthEdit() {
  isEditingDrawLength.value = false;
}

// Inline dimension editor actions
function onDimensionDblClick(el: PlanElement, evt: MouseEvent) {
  const currentLength = wallLengthMeters(el);
  dimensionEdit.value = {
    elementId: el.id,
    value: currentLength.toFixed(2),
    clientX: evt.clientX,
    clientY: evt.clientY,
  };
}

function applyDimensionEdit() {
  if (!dimensionEdit.value) return;
  const val = parseFloat(dimensionEdit.value.value);
  if (!Number.isFinite(val) || val <= 0) {
    dimensionEdit.value = null;
    return;
  }
  const idx = elements.value.findIndex(
    e => e.id === dimensionEdit.value!.elementId
  );
  if (idx !== -1) {
    const el = elements.value[idx];
    if (el) {
      setElementLengthMeters(el, val);
    }
  }
  dimensionEdit.value = null;
}

function cancelDimensionEdit() {
  dimensionEdit.value = null;
}

// Isolate mode
function toggleIsolate(id: string) {
  if (!isolatedElementIds.value || isolatedElementIds.value.length === 0) {
    isolatedElementIds.value = [id];
    return;
  }
  if (isolatedElementIds.value.includes(id)) {
    isolatedElementIds.value = null;
  } else {
    isolatedElementIds.value = [id];
  }
}

// Keyboard delete
function deleteSelected() {
  if (!selectedElementId.value) return;
  elements.value = elements.value.filter(e => e.id !== selectedElementId.value);
  selectedElementId.value = null;
}

function handleKeydown(e: KeyboardEvent) {
  if (
    (e.key === "Delete" || e.key === "Backspace") &&
    selectedElementId.value
  ) {
    e.preventDefault();
    deleteSelected();
  }
  if (e.key === "1") {
    mode.value = "2d";
  } else if (e.key === "2") {
    mode.value = "3d";
  }
}

// Lifecycle
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

<style scoped>
.floor-dot-grid {
  background-image: radial-gradient(
    rgba(255, 255, 255, 0.08) 1.5px,
    transparent 1.5px
  );
  background-size: 18px 18px;
  background-position: 0 0;
  opacity: 0.6;
}

.handle {
  fill: rgba(0, 0, 0, 0.65);
  stroke: rgba(255, 255, 255, 0.9);
  stroke-width: 1.5;
}

.handle--active {
  fill: #000000;
  stroke: #ffffff;
  stroke-width: 2;
}

.dimension-text {
  font-size: 11px;
  fill: #f5f5f5;
  paint-order: stroke;
  stroke: rgba(0, 0, 0, 0.6);
  stroke-width: 3;
  stroke-linejoin: round;
}

.room-label {
  font-size: 11px;
  fill: #f5f5f5;
  paint-order: stroke;
  stroke: rgba(0, 0, 0, 0.6);
  stroke-width: 3;
  stroke-linejoin: round;
}
</style>

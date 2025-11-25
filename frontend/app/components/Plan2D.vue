<template>
  <div class="absolute inset-0 bg-white">
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
            fill="#000000"
            fill-opacity="0.05"
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
            stroke="#000000"
            :stroke-width="strokeWidth(element) + 8"
            stroke-linecap="round"
            stroke-opacity="0.1"
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
      v-if="isDrawing && currentElement && currentElement.type !== 'measure'"
      class="bottom-20 left-1/2 fixed flex items-center gap-2 bg-black/90 shadow-md px-3 py-1.5 border border-white/30 rounded-full text-[11px] text-white -translate-x-1/2 pointer-events-auto"
    >
      <span class="text-white/60 uppercase tracking-[0.18em]">Length</span>
      <input
        v-model="drawLengthInput"
        type="number"
        step="0.05"
        class="bg-transparent border-none outline-none w-20 text-white text-xs text-right"
        @focus="isEditingDrawLength = true"
        @blur="isEditingDrawLength = false"
        @keydown.stop.prevent.enter="applyDrawLength"
        @keydown.stop.esc="cancelDrawLengthEdit"
      />
      <span class="text-[11px] text-white/40">m</span>
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
        class="flex items-center gap-1 bg-black shadow-md px-3 py-1 border border-white/40 rounded-full text-white"
      >
        <input
          v-model="dimensionEdit.value"
          type="number"
          step="0.01"
          class="bg-transparent outline-none w-20 text-white text-xs text-right"
          @keydown.stop.prevent.enter="applyDimensionEdit"
          @keydown.stop.esc="cancelDimensionEdit"
          autofocus
        />
        <span class="text-[11px] text-white/50">m</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, type Ref } from "vue";
import { nanoid } from "nanoid";

// Types
export type ToolType = "select" | "wall" | "window" | "door" | "measure";

export interface PlanElement {
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

export interface Room {
  id: string;
  name: string;
  polygon: { x: number; y: number }[];
  area: number;
  centroid: { x: number; y: number };
}

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Props & Emits
const props = defineProps<{
  elements: PlanElement[];
  tool: ToolType;
  viewBox: ViewBox;
  showDimensions: boolean;
  lockOrthogonal: boolean;
  incrementalSnap: boolean;
  selectionFilter: "all" | "walls" | "openings";
  defaultWallHeight: number;
  defaultWallThickness: number;
}>();

const emit = defineEmits<{
  (e: "update:elements", elements: PlanElement[]): void;
  (e: "update:viewBox", viewBox: ViewBox): void;
  (e: "select", elementId: string | null): void;
}>();

// Constants
const HANDLE_RADIUS = 16;
const SNAP_RADIUS = 30;
const WORLD_SCALE = 0.01; // 1 SVG unit => 0.01 meters
const WALL_ATTACH_RADIUS = 30;
const SNAP_STEP_METERS = 0.5;
const VIEWBOX_HEIGHT = 700;
const VIEWBOX_WIDTH = 1000;

// Local State
const svgRef: Ref<SVGSVGElement | null> = ref(null);
const selectedElementId = ref<string | null>(null);
const draggingHandle = ref<"start" | "end" | null>(null);
const isDrawing = ref(false);
const currentElement = ref<PlanElement | null>(null);
const isEditingDrawLength = ref(false);
const drawLengthInput = ref("0.00");
const isolatedElementIds = ref<string[] | null>(null);
const isPanning = ref(false);
const panStart = ref<{ x: number; y: number } | null>(null);
const panViewBoxStart = ref<ViewBox | null>(null);

const dimensionEdit = ref<{
  elementId: string;
  value: string;
  clientX: number;
  clientY: number;
} | null>(null);

// Computed
const effectiveElements = computed<PlanElement[]>(() => {
  const base = currentElement.value
    ? [...props.elements, currentElement.value]
    : props.elements;
  if (!isolatedElementIds.value || isolatedElementIds.value.length === 0) {
    return base;
  }
  const set = new Set(isolatedElementIds.value);
  return base.filter(e => set.has(e.id));
});

const rooms = computed<Room[]>(() => computeRooms(props.elements));

// Methods
function strokeFor(type: ToolType) {
  if (type === "wall") return "#000000";
  if (type === "window") return "rgba(0, 0, 0, 0.85)";
  if (type === "door") return "rgba(0, 0, 0, 0.65)";
  if (type === "measure") return "rgba(0, 0, 0, 0.5)";
  return "#000000";
}

function strokeWidth(element: PlanElement) {
  const base = 4;
  return base + element.thickness * 20;
}

function svgCoords(event: PointerEvent | WheelEvent) {
  const svg = svgRef.value;
  if (!svg) return { x: 0, y: 0 };

  const rect = svg.getBoundingClientRect();
  const vb = props.viewBox;
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

function snapToExisting(x: number, y: number, ignoreId?: string) {
  let bestX = x;
  let bestY = y;
  let bestDist = SNAP_RADIUS;

  for (const el of props.elements) {
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

  for (const el of props.elements) {
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
  return props.elements.find(e => e.id === id && e.type === "wall") ?? null;
}

function applyOrthogonal(
  anchorX: number,
  anchorY: number,
  x: number,
  y: number
) {
  if (!props.lockOrthogonal) {
    return { x, y };
  }
  const dx = x - anchorX;
  const dy = y - anchorY;
  if (Math.abs(dx) > Math.abs(dy)) {
    return { x, y: anchorY };
  }
  return { x: anchorX, y };
}

function applyIncrementalSnap(
  anchorX: number,
  anchorY: number,
  x: number,
  y: number
) {
  if (!props.incrementalSnap) {
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

function canSelectElement(el: PlanElement) {
  if (props.selectionFilter === "all") return true;
  if (props.selectionFilter === "walls") return el.type === "wall";
  if (props.selectionFilter === "openings")
    return el.type === "window" || el.type === "door";
  return true;
}

function findHandleAt(x: number, y: number) {
  for (let i = props.elements.length - 1; i >= 0; i -= 1) {
    const el = props.elements[i];
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

  for (const el of props.elements) {
    if (!canSelectElement(el)) continue;
    const d = distancePointToSegment(x, y, el.x1, el.y1, el.x2, el.y2);
    if (d < bestDist) {
      bestDist = d;
      bestEl = el;
    }
  }
  return bestEl;
}

function onPointerDown(event: PointerEvent) {
  if (event.button === 2) {
    isPanning.value = true;
    panStart.value = { x: event.clientX, y: event.clientY };
    panViewBoxStart.value = { ...props.viewBox };
    return;
  }

  const { x, y } = svgCoords(event);

  if (props.tool === "select") {
    const handleHit = findHandleAt(x, y);
    if (handleHit) {
      selectedElementId.value = handleHit.id;
      draggingHandle.value = handleHit.handle;
    } else {
      const el = findNearestElement(x, y);
      selectedElementId.value = el ? el.id : null;
      draggingHandle.value = null;
    }
    emit("select", selectedElementId.value);
    isDrawing.value = false;
    currentElement.value = null;
    return;
  }

  if (props.tool === "measure") {
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
  emit("select", null);

  const hit = findHandleAt(x, y);
  if (hit) {
    selectedElementId.value = hit.id;
    draggingHandle.value = hit.handle;
    emit("select", hit.id);
    isDrawing.value = false;
    currentElement.value = null;
    return;
  }

  let startX = x;
  let startY = y;
  let attachedWallId: string | undefined;

  if (props.tool === "window" || props.tool === "door") {
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
    type: props.tool,
    x1: startX,
    y1: startY,
    x2: startX,
    y2: startY,
    height: props.defaultWallHeight,
    thickness: props.defaultWallThickness,
    attachedWallId,
  };

  currentElement.value = element;
  isDrawing.value = true;
  selectedElementId.value = element.id;
  emit("select", element.id);
  draggingHandle.value = null;
  drawLengthInput.value = "0.00";
}

function onPointerMove(event: PointerEvent) {
  if (isPanning.value && panStart.value && panViewBoxStart.value) {
    const svg = svgRef.value;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const dxPixels = event.clientX - panStart.value.x;
    const dyPixels = event.clientY - panStart.value.y;
    const vb = panViewBoxStart.value;
    const dxWorld = (dxPixels / rect.width) * vb.width;
    const dyWorld = (dyPixels / rect.height) * vb.height;
    emit("update:viewBox", {
      ...vb,
      x: vb.x - dxWorld,
      y: vb.y - dyWorld,
    });
    return;
  }

  const { x, y } = svgCoords(event);

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

  if (draggingHandle.value && selectedElementId.value) {
    const idx = props.elements.findIndex(e => e.id === selectedElementId.value);
    if (idx !== -1) {
      const el = { ...props.elements[idx] };
      if (!el) return;

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
      const newElements = [...props.elements];
      newElements[idx] = el;
      emit("update:elements", newElements);
    }
    return;
  }

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
      emit("update:elements", [...props.elements, el]);
    }
  }

  isDrawing.value = false;
  currentElement.value = null;
}

function onWheel(event: WheelEvent) {
  const direction = event.deltaY > 0 ? 1 : -1;
  const factor = direction > 0 ? 1.1 : 0.9;

  const vb = props.viewBox;
  const newWidth = clamp(vb.width * factor, 200, 8000);
  const ratio = VIEWBOX_HEIGHT / VIEWBOX_WIDTH;
  const newHeight = newWidth * ratio;

  const dx = (newWidth - vb.width) / 2;
  const dy = (newHeight - vb.height) / 2;

  emit("update:viewBox", {
    x: vb.x - dx,
    y: vb.y - dy,
    width: newWidth,
    height: newHeight,
  });
}

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

function roomPolygonPoints(room: Room) {
  return room.polygon.map(p => `${p.x},${p.y}`).join(" ");
}

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
  const idx = props.elements.findIndex(
    e => e.id === dimensionEdit.value!.elementId
  );
  if (idx !== -1) {
    const el = { ...props.elements[idx] };
    if (el) {
      setElementLengthMeters(el, val);
      const newElements = [...props.elements];
      newElements[idx] = el;
      emit("update:elements", newElements);
    }
  }
  dimensionEdit.value = null;
}

function cancelDimensionEdit() {
  dimensionEdit.value = null;
}

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

function deleteSelected() {
  if (!selectedElementId.value) return;
  const newElements = props.elements.filter(
    e => e.id !== selectedElementId.value
  );
  emit("update:elements", newElements);
  selectedElementId.value = null;
  emit("select", null);
}

function handleKeydown(e: KeyboardEvent) {
  if (
    (e.key === "Delete" || e.key === "Backspace") &&
    selectedElementId.value
  ) {
    e.preventDefault();
    deleteSelected();
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

<style scoped>
.floor-dot-grid {
  background-image: radial-gradient(
    rgba(0, 0, 0, 0.1) 1.5px,
    transparent 1.5px
  );
  background-size: 18px 18px;
  background-position: 0 0;
  opacity: 0.6;
}

.handle {
  fill: rgba(255, 255, 255, 0.9);
  stroke: rgba(0, 0, 0, 0.65);
  stroke-width: 1.5;
}

.handle--active {
  fill: #ffffff;
  stroke: #000000;
  stroke-width: 2;
}

.dimension-text {
  font-size: 11px;
  fill: #000000;
  paint-order: stroke;
  stroke: rgba(255, 255, 255, 0.8);
  stroke-width: 3;
  stroke-linejoin: round;
}

.room-label {
  font-size: 11px;
  fill: #000000;
  paint-order: stroke;
  stroke: rgba(255, 255, 255, 0.8);
  stroke-width: 3;
  stroke-linejoin: round;
}
</style>

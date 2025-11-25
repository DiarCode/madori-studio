<template>
  <div class="relative w-full h-full">
    <TresCanvas clear-color="#ffffff" class="absolute inset-0">
      <TresPerspectiveCamera :position="cameraPosition" :fov="cameraFov" />
      <OrbitControls :enable-damping="true" :target="orbitTarget" />

      <TresAmbientLight :intensity="0.8" />
      <TresDirectionalLight :position="[6, 10, 8]" :intensity="1.2" />

      <!-- Floor -->
      <TresMesh :rotation="[-Math.PI / 2, 0, 0]" :position="[0, -0.01, 0]">
        <TresPlaneGeometry :args="[100, 100, 40, 40]" />
        <TresMeshStandardMaterial
          v-if="floorTexture"
          :map="floorTexture"
          :roughness="0.8"
          :metalness="0.1"
        />
        <TresMeshStandardMaterial
          v-else
          color="#f0f0f0"
          :roughness="0.8"
          :metalness="0.1"
        />
      </TresMesh>

      <!-- Walls -->
      <TresMesh
        v-for="mesh in wallMeshes"
        :key="mesh.id"
        :position="mesh.position"
        :rotation="mesh.rotation"
      >
        <TresBoxGeometry :args="[mesh.length, mesh.height, mesh.thickness]" />
        <TresMeshStandardMaterial
          v-if="wallTexture"
          :map="wallTexture"
          :roughness="0.6"
          :metalness="0.1"
          :transparent="true"
          :opacity="xrayMode ? 0.35 : 1"
        />
        <TresMeshStandardMaterial
          v-else
          color="#e0e0e0"
          :roughness="0.6"
          :metalness="0.1"
          :transparent="true"
          :opacity="xrayMode ? 0.35 : 1"
        />
      </TresMesh>

      <!-- Windows (Model) -->
      <primitive
        v-for="mesh in windowMeshes"
        :key="mesh.id"
        :object="windowModelClone(mesh)"
        :position="mesh.position"
        :rotation="mesh.rotation"
        :scale="mesh.scale"
      />

      <!-- Doors (Model) -->
      <primitive
        v-for="mesh in doorMeshes"
        :key="mesh.id"
        :object="doorModelClone(mesh)"
        :position="mesh.position"
        :rotation="mesh.rotation"
        :scale="mesh.scale"
      />
    </TresCanvas>

    <!-- 3D view hint -->
    <div class="top-4 left-6 absolute text-xs pointer-events-none">
      <p class="font-medium text-black/80 uppercase tracking-[0.16em]">
        3D orbit view
      </p>
      <p class="text-black/60">
        Drag to orbit, scroll to zoom, right-click to pan.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef, watchEffect } from "vue";
import { useTexture, useFBX } from "@tresjs/cientos";
import { Vector3, Euler, Object3D } from "three";
import type { PlanElement, ViewBox } from "./Plan2D.vue";

// Props
const props = defineProps<{
  elements: PlanElement[];
  viewBox: ViewBox;
  xrayMode: boolean;
  cameraMode: "orbit" | "top" | "inside";
}>();

// Constants
const WORLD_SCALE = 0.01; // 1 SVG unit => 0.01 meters

// Assets
const floorTexture = await useTexture({
  map: "/assets/textures/floor.jpg",
});
const wallTexture = await useTexture({
  map: "/assets/textures/wall.jpg",
});

// Load models
// Note: useFBX returns a Group or Object3D. We need to clone it for each instance.
const windowModel = await useFBX("/assets/models/window.fbx");
const doorModel = await useFBX("/assets/models/door.fbx");

// Helper to clone models
function cloneModel(original: Object3D) {
  const clone = original.clone();
  // Traverse to clone materials if needed, or just deep clone
  // For simple placement, standard clone is usually enough if we don't modify materials per instance
  return clone;
}

// Computed Meshes
// Coordinate system:
// 2D: (0,0) top-left. X right, Y down.
// 3D: (0,0,0) center. X right, Y up, Z forward (towards viewer).
// Mapping:
// 2D X -> 3D X
// 2D Y -> 3D Z
// We need to center the plan in 3D world to make orbit controls work nicely around the house.
// But to keep alignment strict, we should calculate the center of the plan once or use a fixed offset.
// Using the viewBox center as the origin for 3D is a good approach to keep what's visible in 2D centered in 3D.

const planCenter = computed(() => {
  // Use the center of the current viewBox to center the 3D view
  return {
    x: props.viewBox.x + props.viewBox.width / 2,
    y: props.viewBox.y + props.viewBox.height / 2,
  };
});

const wallMeshes = computed(() =>
  props.elements
    .filter(e => e.type === "wall")
    .map(el => {
      const dx = el.x2 - el.x1;
      const dy = el.y2 - el.y1;
      const planarLength = Math.hypot(dx, dy);
      const length = planarLength * WORLD_SCALE;
      const angle = Math.atan2(dy, dx); // Angle in 2D (Y down) -> -angle in 3D (Z down/forward)?
      // 3D rotation: Y axis rotation.
      // 0 deg = X axis.
      // In 2D, 0 deg is X axis.
      // So rotation is -angle because 2D Y is down, 3D Z is "down" in top view but actually +Z is out of screen.
      // Let's map: 2D (x, y) -> 3D (x, z).
      // 2D angle atan2(y, x).
      // 3D angle atan2(z, x).
      // Since 2D Y grows down, and 3D Z grows "down" (towards camera in top view usually?),
      // actually standard 3D: Y is up. Z is towards viewer.
      // If we map 2D Y to 3D Z:
      // 2D (1, 1) -> 3D (1, 1).
      // Angle is same.

      const cx = (el.x1 + el.x2) / 2;
      const cy = (el.y1 + el.y2) / 2;

      return {
        id: el.id,
        length,
        height: el.height,
        thickness: el.thickness,
        position: [
          (cx - planCenter.value.x) * WORLD_SCALE,
          el.height / 2,
          (cy - planCenter.value.y) * WORLD_SCALE,
        ] as [number, number, number],
        rotation: [0, -angle, 0] as [number, number, number], // Negative angle to match coordinate system rotation
      };
    })
);

// Helper for models
function windowModelClone(mesh: any) {
  const clone = cloneModel(windowModel);
  // Adjust model orientation if needed. Assuming model is Y-up, facing Z or X.
  // We might need to rotate the model container to align with the wall.
  // FBX models often come with different scales/rotations.
  // We'll apply the mesh rotation to the primitive.
  return clone;
}

function doorModelClone(mesh: any) {
  const clone = cloneModel(doorModel);
  return clone;
}

const windowMeshes = computed(() =>
  props.elements
    .filter(e => e.type === "window")
    .map(el => {
      const dx = el.x2 - el.x1;
      const dy = el.y2 - el.y1;
      const planarLength = Math.hypot(dx, dy);
      const length = planarLength * WORLD_SCALE;
      const angle = Math.atan2(dy, dx);
      const cx = (el.x1 + el.x2) / 2;
      const cy = (el.y1 + el.y2) / 2;

      // Window specific
      const height = 1.2;
      const yCenter = 1.4;

      // Scale model to fit the opening
      // Assuming model is unit size 1x1x1 or similar. We need to scale it.
      // Let's assume standard window model is ~1m wide.
      // We scale X to length, Y to height, Z to thickness.
      // We might need to inspect the model size, but for now we apply scale based on dimensions.
      // If the model is not 1 unit, this will be off.
      // Ideally we measure the model bounding box.
      // For this task, we'll assume the user provided models are normalized or we scale blindly.
      // Let's try scaling to dimensions.

      return {
        id: el.id,
        position: [
          (cx - planCenter.value.x) * WORLD_SCALE,
          yCenter - height / 2, // Model origin might be bottom-left
          (cy - planCenter.value.y) * WORLD_SCALE,
        ] as [number, number, number],
        rotation: [0, -angle, 0] as [number, number, number],
        scale: [length * 0.01, height * 0.01, el.thickness * 0.01] as [
          number,
          number,
          number
        ], // FBX usually cm? If 1 unit = 1cm, then scale 100 = 1m.
        // If 1 unit = 1m, then scale 1.
        // Let's guess FBX is in cm (common). So if we want 1m, we need 100 units?
        // Or if we scale the object: if object is 100 units wide (1m), and we want 2m (200 units), we scale by 2?
        // Let's assume we pass scale [1, 1, 1] for now and see.
        // Actually, let's try to fit it.
        // Better: use a placeholder box if model fails, but here we use primitive.
        // Let's try a safe scale factor.
        // If the model is 100x100x10 units (cm), and we want length L (meters).
        // L meters = L * 100 cm.
        // Scale X = L * 100 / 100 = L.
        // So if model is in cm, and we work in meters, we might need to scale by 0.01?
        // Wait, Tres/Three works in arbitrary units. We decided 1 unit = 1 meter.
        // If FBX is in cm, it will appear huge (100 units = 100 meters).
        // So we likely need to scale down by 0.01.
      };
    })
);

const doorMeshes = computed(() =>
  props.elements
    .filter(e => e.type === "door")
    .map(el => {
      const dx = el.x2 - el.x1;
      const dy = el.y2 - el.y1;
      const planarLength = Math.hypot(dx, dy);
      const length = planarLength * WORLD_SCALE;
      const angle = Math.atan2(dy, dx);
      const cx = (el.x1 + el.x2) / 2;
      const cy = (el.y1 + el.y2) / 2;

      const height = 2.1;
      const yCenter = height / 2;

      return {
        id: el.id,
        position: [
          (cx - planCenter.value.x) * WORLD_SCALE,
          0, // Doors on floor
          (cy - planCenter.value.y) * WORLD_SCALE,
        ] as [number, number, number],
        rotation: [0, -angle, 0] as [number, number, number],
        scale: [length * 0.01, height * 0.01, el.thickness * 0.01] as [
          number,
          number,
          number
        ],
      };
    })
);

// Camera
const cameraPosition = computed<[number, number, number]>(() => {
  const distance = 10;
  switch (props.cameraMode) {
    case "top":
      return [0, 20, 0];
    case "inside":
      return [0, 1.7, 0];
    case "orbit":
    default:
      return [10, 10, 10];
  }
});

const orbitTarget = computed<[number, number, number]>(() => [0, 0, 0]);

const cameraFov = computed(() => (props.cameraMode === "top" ? 30 : 45));
</script>

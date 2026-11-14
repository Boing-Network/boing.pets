import type { WorldZoneConfig } from "../world/config/zones";
import { MEADOW_TREE_SPOTS } from "./meadowLayout";
import { yardKitCameraOccluders } from "./yardKitObstacles";

/** Pure camera helpers for pasture zoom, ground clearance, and landmark occlusion. */

export const PASTURE_ZOOM_MIN = 6;
export const PASTURE_ZOOM_MAX = 58;
export const PASTURE_ZOOM_DEFAULT = 18;
export const PASTURE_CAM_CLEARANCE = 1.25;
export const PASTURE_CAM_PITCH = 0.52;

export type Vec3 = { x: number; y: number; z: number };

export type LandmarkBox = {
  x: number;
  z: number;
  halfW: number;
  halfD: number;
  minY: number;
  maxY: number;
};

export function clampZoom(
  distance: number,
  min = PASTURE_ZOOM_MIN,
  max = PASTURE_ZOOM_MAX,
): number {
  if (!Number.isFinite(distance)) return PASTURE_ZOOM_DEFAULT;
  return Math.min(max, Math.max(min, distance));
}

/** Wheel / trackpad zoom. Positive deltaY zooms out. */
export function zoomFromWheel(
  distance: number,
  deltaY: number,
  deltaMode = 0,
  sensitivity = 1,
): number {
  let dy = deltaY;
  if (deltaMode === 1) dy *= 16;
  if (deltaMode === 2) dy *= 800;
  const scale = Math.min(2, Math.max(0.4, sensitivity || 1));
  const factor = Math.exp(Math.max(-80, Math.min(80, dy)) * 0.0016 * scale);
  return clampZoom(distance * factor);
}

export function zoomBySteps(
  distance: number,
  steps: number,
  step = 1.18,
  sensitivity = 1,
): number {
  const scale = Math.min(2, Math.max(0.4, sensitivity || 1));
  return clampZoom(distance * Math.pow(step, steps * scale));
}

export function cameraMinHeight(
  terrainY: number,
  clearance = PASTURE_CAM_CLEARANCE,
): number {
  return terrainY + clearance;
}

export function liftCameraAboveTerrain(
  y: number,
  terrainY: number,
  clearance = PASTURE_CAM_CLEARANCE,
): number {
  return Math.max(y, cameraMinHeight(terrainY, clearance));
}

/** Yaw that places the camera behind the pet (looking along its facing). */
export function cameraBehindYaw(petYaw: number): number {
  return petYaw + Math.PI;
}

export function cameraOffset(
  look: Vec3,
  distance: number,
  yaw = 0,
  pitch = PASTURE_CAM_PITCH,
): Vec3 {
  const d = clampZoom(distance);
  const cp = Math.cos(pitch);
  return {
    x: look.x + Math.sin(yaw) * cp * d,
    y: look.y + Math.sin(pitch) * d,
    z: look.z + Math.cos(yaw) * cp * d,
  };
}

function insideXz(pos: Vec3, box: LandmarkBox, pad = 0): boolean {
  return (
    Math.abs(pos.x - box.x) < box.halfW + pad &&
    Math.abs(pos.z - box.z) < box.halfD + pad
  );
}

/** Push a camera that has clipped into a landmark out to the nearest wall. */
export function cameraOutsideLandmarks(
  pos: Vec3,
  boxes: LandmarkBox[],
  padding = 0.55,
): Vec3 {
  let cur = { ...pos };
  for (const box of boxes) {
    if (cur.y > box.maxY + 0.2) continue;
    if (!insideXz(cur, box, padding)) continue;
    const dx = cur.x - box.x;
    const dz = cur.z - box.z;
    const limX = box.halfW + padding;
    const limZ = box.halfD + padding;
    const gapX = limX - Math.abs(dx);
    const gapZ = limZ - Math.abs(dz);
    if (gapX < gapZ) {
      cur = {
        ...cur,
        x: box.x + Math.sign(dx || 1) * limX,
      };
    } else {
      cur = {
        ...cur,
        z: box.z + Math.sign(dz || 1) * limZ,
      };
    }
  }
  return cur;
}

/**
 * Slab test: first hit of segment a?b against an axis-aligned box, or null.
 * Returns t in (0, 1) where a + t*(b-a) first touches the box.
 */
export function segmentHitsBox(
  a: Vec3,
  b: Vec3,
  box: LandmarkBox,
): number | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  let tMin = 0;
  let tMax = 1;

  const slab = (
    start: number,
    dir: number,
    min: number,
    max: number,
  ): boolean => {
    if (Math.abs(dir) < 1e-8) return start >= min && start <= max;
    const inv = 1 / dir;
    let t1 = (min - start) * inv;
    let t2 = (max - start) * inv;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    return tMin <= tMax;
  };

  if (!slab(a.x, dx, box.x - box.halfW, box.x + box.halfW)) return null;
  if (!slab(a.z, dz, box.z - box.halfD, box.z + box.halfD)) return null;
  if (!slab(a.y, dy, box.minY, box.maxY)) return null;
  if (tMin <= 0 || tMin >= 1) return null;
  return tMin;
}

/**
 * If a landmark sits between the camera and the look target, pull the camera
 * in to just in front of the occluder so the roof/walls don't clip the view.
 */
export function pullCameraForOcclusion(
  cam: Vec3,
  look: Vec3,
  boxes: LandmarkBox[],
  margin = 0.7,
): Vec3 {
  let bestT: number | null = null;
  for (const box of boxes) {
    const t = segmentHitsBox(look, cam, box);
    if (t === null) continue;
    if (bestT === null || t < bestT) bestT = t;
  }
  if (bestT === null) return cam;
  const t = Math.max(
    0.12,
    bestT -
      margin /
        Math.max(
          0.01,
          Math.hypot(cam.x - look.x, cam.y - look.y, cam.z - look.z),
        ),
  );
  return {
    x: look.x + (cam.x - look.x) * t,
    y: look.y + (cam.y - look.y) * t,
    z: look.z + (cam.z - look.z) * t,
  };
}

export function resolveFollowCamera(
  look: Vec3,
  distance: number,
  terrainAt: (x: number, z: number) => number,
  boxes: LandmarkBox[],
  yaw = 0,
  pitch = PASTURE_CAM_PITCH,
): Vec3 {
  let cam = cameraOffset(look, distance, yaw, pitch);
  cam = pullCameraForOcclusion(cam, look, boxes);
  cam = cameraOutsideLandmarks(cam, boxes);
  cam = {
    ...cam,
    y: liftCameraAboveTerrain(cam.y, terrainAt(cam.x, cam.z)),
  };
  cam = cameraOutsideLandmarks(cam, boxes);
  cam = {
    ...cam,
    y: liftCameraAboveTerrain(cam.y, terrainAt(cam.x, cam.z)),
  };
  return cam;
}
export function cameraOccludersForZone(
  zone: WorldZoneConfig,
  groundY = -1,
): LandmarkBox[] {
  const boxes: LandmarkBox[] = [];
  for (const item of zone.landmarks) {
    if (item.height < 1) continue;
    boxes.push({
      x: item.position.x,
      z: item.position.z,
      halfW: item.width / 2,
      halfD: item.depth / 2,
      minY: groundY,
      maxY: item.height + 1.1,
    });
  }
  if (zone.id === "pasture") {
    for (const [x, z] of MEADOW_TREE_SPOTS) {
      boxes.push({
        x,
        z,
        halfW: 1.1,
        halfD: 1.1,
        minY: groundY,
        maxY: 3.2,
      });
    }
    boxes.push(...yardKitCameraOccluders(groundY));
  }
  return boxes;
}

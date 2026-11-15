import type { WorldZoneConfig } from "../world/config/zones";
import { smoothDamp } from "./motion";
import {
  CITY_PARK_TREES,
  cityBuildingCameraSolids,
  cityDressingSolids,
} from "./cityLayout";
import { yardKitCameraOccluders } from "./yardKitObstacles";

/** Pure camera helpers for pasture zoom, ground clearance, and building clearance. */

export const PASTURE_ZOOM_MIN = 6;
export const PASTURE_ZOOM_MAX = 58;
export const PASTURE_ZOOM_DEFAULT = 15;
export const PASTURE_CAM_CLEARANCE = 1.25;
export const PASTURE_CAM_PITCH = 0.52;
/** Nearly behind the character, still high enough to see the street. */
export const PASTURE_CAM_PITCH_MIN = 0.18;
/** Steep enough to look down the block, short of a top-down flip. */
export const PASTURE_CAM_PITCH_MAX = 1.05;
/** Radians per pixel at sensitivity 1. Mouse right yaws the view right. */
export const LOOK_YAW_RADIANS_PER_PX = 0.003;
/** Mouse down pitches the view down. */
export const LOOK_PITCH_RADIANS_PER_PX = 0.0022;
/** Ignore a pointer-lock recenter spike without dulling a fast swipe. */
export const LOOK_MAX_PIXELS_PER_EVENT = 140;

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

export function clampPitch(
  pitch: number,
  min = PASTURE_CAM_PITCH_MIN,
  max = PASTURE_CAM_PITCH_MAX,
): number {
  if (!Number.isFinite(pitch)) return PASTURE_CAM_PITCH;
  return Math.min(max, Math.max(min, pitch));
}

/**
 * Orbit from a locked pointer. `movementX` / `movementY` are the browser
 * deltas (right and down are positive). Sensitivity matches the other
 * camera controls, clamped to 0.4..2.
 */
export function applyPointerLook(
  yaw: number,
  pitch: number,
  movementX: number,
  movementY: number,
  sensitivity = 1,
): { yaw: number; pitch: number } {
  const scale = Math.min(2, Math.max(0.4, sensitivity || 1));
  const limit = LOOK_MAX_PIXELS_PER_EVENT;
  const clampDelta = (value: number) => {
    if (!Number.isFinite(value)) return 0;
    return Math.min(limit, Math.max(-limit, value));
  };
  const dx = clampDelta(movementX);
  const dy = clampDelta(movementY);
  // Right and down are positive in the browser. Yaw is inverted so a
  // drag to the right turns the view right. Pitch stays positive so a
  // drag up lowers the orbit and looks up.
  return {
    yaw: yaw - dx * LOOK_YAW_RADIANS_PER_PX * scale,
    pitch: clampPitch(pitch + dy * LOOK_PITCH_RADIANS_PER_PX * scale),
  };
}

/** True when a press is on the 3D view, not a HUD control sitting on top of it. */
export function isCanvasLookTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as {
    tagName?: string;
    closest?: (selector: string) => unknown;
  };
  const blocked =
    "button, a, input, textarea, select, label, .joystick, [role='dialog']";
  if (typeof el.closest === "function") {
    if (el.closest(blocked)) return false;
    return !!el.closest("canvas");
  }
  return el.tagName === "CANVAS";
}

/** Seconds for the follow rig to catch a moving target. Shared by position and look-at. */
export const FOLLOW_SMOOTH_TIME = 0.18;

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

function pointInsideBox(pos: Vec3, box: LandmarkBox, pad: number): boolean {
  return (
    pos.y >= box.minY - pad &&
    pos.y <= box.maxY + pad &&
    Math.abs(pos.x - box.x) <= box.halfW + pad &&
    Math.abs(pos.z - box.z) <= box.halfD + pad
  );
}

/**
 * How far a unit ray must travel to leave an expanded box when `origin` is
 * already inside it. Null when the origin is outside.
 */
function exitDistance(
  origin: Vec3,
  dir: Vec3,
  box: LandmarkBox,
  pad: number,
): number | null {
  const minX = box.x - box.halfW - pad;
  const maxX = box.x + box.halfW + pad;
  const minY = box.minY - pad;
  const maxY = box.maxY + pad;
  const minZ = box.z - box.halfD - pad;
  const maxZ = box.z + box.halfD + pad;
  let tMax = Infinity;
  const axis = (o: number, d: number, min: number, max: number): boolean => {
    if (Math.abs(d) < 1e-8) return o >= min && o <= max;
    let t1 = (min - o) / d;
    let t2 = (max - o) / d;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
    }
    if (t1 > 1e-5 || t2 < -1e-5) return false;
    tMax = Math.min(tMax, t2);
    return true;
  };
  if (!axis(origin.x, dir.x, minX, maxX)) return null;
  if (!axis(origin.y, dir.y, minY, maxY)) return null;
  if (!axis(origin.z, dir.z, minZ, maxZ)) return null;
  if (!Number.isFinite(tMax) || tMax < 0) return null;
  return tMax;
}

/**
 * If the orbit point sits inside a building, slide the camera farther from
 * the pet along the same ray until it is clear. Never shorten the rig: a
 * building between the pet and the camera used to pull the view in, and that
 * pull chattered while orbiting so the walls flickered.
 */
export function pushCameraOutsideLandmarks(
  cam: Vec3,
  look: Vec3,
  boxes: LandmarkBox[],
  padding = 0.4,
): Vec3 {
  const dx = cam.x - look.x;
  const dy = cam.y - look.y;
  const dz = cam.z - look.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.05) return cam;
  const dir = { x: dx / len, y: dy / len, z: dz / len };
  let dist = len;
  const maxDist = len + 14;
  for (let pass = 0; pass < 6; pass++) {
    const pos = {
      x: look.x + dir.x * dist,
      y: look.y + dir.y * dist,
      z: look.z + dir.z * dist,
    };
    let next = dist;
    for (const box of boxes) {
      if (!pointInsideBox(pos, box, padding)) continue;
      const exit = exitDistance(pos, dir, box, padding);
      next = Math.max(next, dist + (exit ?? 0.35) + 0.08);
    }
    if (next <= dist + 1e-4) break;
    dist = Math.min(next, maxDist);
    if (dist >= maxDist - 1e-4) break;
  }
  return {
    x: look.x + dir.x * dist,
    y: look.y + dir.y * dist,
    z: look.z + dir.z * dist,
  };
}

/** Damp a follow point without introducing a yaw of its own. */
export function dampFollowPoint(
  current: Vec3,
  velocity: Vec3,
  target: Vec3,
  dt: number,
  smoothTime = FOLLOW_SMOOTH_TIME,
): { position: Vec3; velocity: Vec3 } {
  const x = smoothDamp(current.x, target.x, velocity.x, smoothTime, dt);
  const y = smoothDamp(current.y, target.y, velocity.y, smoothTime, dt);
  const z = smoothDamp(current.z, target.z, velocity.z, smoothTime, dt);
  return {
    position: { x: x.value, y: y.value, z: z.value },
    velocity: { x: x.velocity, y: y.velocity, z: z.velocity },
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
  cam = pushCameraOutsideLandmarks(cam, look, boxes);
  cam = {
    ...cam,
    y: liftCameraAboveTerrain(cam.y, terrainAt(cam.x, cam.z)),
  };
  cam = pushCameraOutsideLandmarks(cam, look, boxes);
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
    for (const [x, z] of CITY_PARK_TREES) {
      boxes.push({
        x,
        z,
        halfW: 1.1,
        halfD: 1.1,
        minY: groundY,
        maxY: 3.2,
      });
    }
    for (const solid of [
      ...cityBuildingCameraSolids(),
      ...cityDressingSolids(),
    ]) {
      boxes.push({
        x: solid.x,
        z: solid.z,
        halfW: solid.halfW,
        halfD: solid.halfD,
        minY: groundY,
        maxY: solid.height + 0.4,
      });
    }
    boxes.push(...yardKitCameraOccluders(groundY));
  }
  return boxes;
}

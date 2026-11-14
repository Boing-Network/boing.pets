/** Shared exclusion footprints so meadow decor stays off water, paths, and pads. */

import { PASTURE_ZONE } from "../world/config/zones";
import {
  MEADOW_FENCES,
  MEADOW_FENCE_HALF_THICK,
  PASTURE_GROUND_RADIUS,
  distanceToPasturePath,
  pointToSegment,
} from "./meadowLayout";

export const POND_WATER_LIFT = 0.1;
export const POND_RIM_LIFT = 0.12;
export const POND_RIM_WIDTH = 0.48;
export const POND_DECOR_MARGIN = 0.9;
export const PATH_DECOR_CLEAR = 1.8;
export const PAD_DECOR_MARGIN = 0.55;
export const FENCE_DECOR_CLEAR = 0.45;
export const DECOR_BASE_Y_TOLERANCE = 0.08;

/** Landmark pads where grass and tufts should not sit. */
export const MEADOW_PAD_IDS: readonly string[] = [
  "snack-barn",
  "crafting-station",
  "market-stall",
  "customization-station",
  "crystal-quarry",
  "pond-pier",
  "treasure-dig",
  "garden-beds",
  "kitchen-hut",
  "race-gate",
  "home-plot",
];

export type MeadowEllipse = {
  x: number;
  z: number;
  rx: number;
  rz: number;
};

export function lilyPondEllipse(): MeadowEllipse | null {
  const pond = PASTURE_ZONE.landmarks.find((item) => item.id === "lily-pond");
  if (!pond) return null;
  return {
    x: pond.position.x,
    z: pond.position.z,
    rx: pond.width / 2,
    rz: pond.depth / 2,
  };
}

/** Extra outward offset so dirt trails meet the sand rim, not the water. */
export const POND_PATH_OUTSET = 0.12;

/** Local offset for the Pond Pier billboard, north of the deck and above the posts. */
export const POND_PIER_LABEL_LOCAL = { x: -0.2, y: 2.7, z: 1.2 } as const;

/**
 * Point on the ellipse (plus optional outward margin) in the direction
 * from the center toward (fromX, fromZ).
 */
export function ellipseRimPoint(
  ellipse: MeadowEllipse,
  fromX: number,
  fromZ: number,
  outward = POND_PATH_OUTSET,
): { x: number; z: number } {
  const rx = ellipse.rx + outward;
  const rz = ellipse.rz + outward;
  const dx = fromX - ellipse.x;
  const dz = fromZ - ellipse.z;
  const denom = (dx * dx) / (rx * rx) + (dz * dz) / (rz * rz);
  if (!(denom > 1e-8) || !Number.isFinite(denom)) {
    return { x: ellipse.x + rx, z: ellipse.z };
  }
  const t = 1 / Math.sqrt(denom);
  return { x: ellipse.x + t * dx, z: ellipse.z + t * dz };
}

export function ellipseContains(
  ellipse: MeadowEllipse,
  x: number,
  z: number,
  margin = 0,
): boolean {
  const rx = ellipse.rx + margin;
  const rz = ellipse.rz + margin;
  if (rx <= 0 || rz <= 0) return false;
  const dx = (x - ellipse.x) / rx;
  const dz = (z - ellipse.z) / rz;
  return dx * dx + dz * dz < 1;
}

export function inPondFootprint(
  x: number,
  z: number,
  margin = POND_DECOR_MARGIN,
): boolean {
  const pond = lilyPondEllipse();
  return pond ? ellipseContains(pond, x, z, margin) : false;
}

export function inPadFootprint(
  x: number,
  z: number,
  margin = PAD_DECOR_MARGIN,
): boolean {
  for (const land of PASTURE_ZONE.landmarks) {
    if (!MEADOW_PAD_IDS.includes(land.id)) continue;
    const hx = land.width / 2 + margin;
    const hz = land.depth / 2 + margin;
    if (
      Math.abs(x - land.position.x) <= hx &&
      Math.abs(z - land.position.z) <= hz
    ) {
      return true;
    }
  }
  return false;
}

export function inPathFootprint(
  x: number,
  z: number,
  clearance = PATH_DECOR_CLEAR,
): boolean {
  return distanceToPasturePath(x, z) < clearance;
}

export function inFenceFootprint(
  x: number,
  z: number,
  clearance = FENCE_DECOR_CLEAR,
): boolean {
  const limit = MEADOW_FENCE_HALF_THICK + clearance;
  for (const rail of MEADOW_FENCES) {
    if (pointToSegment(x, z, rail.x1, rail.z1, rail.x2, rail.z2) < limit) {
      return true;
    }
  }
  return false;
}

/** Keep the compact city district free of meadow grass and tufts. */
export function inPlazaFootprint(x: number, z: number): boolean {
  return Math.abs(x) <= 32 && Math.abs(z) <= 32;
}

/** True when a grass tuft, flower, or rock may be planted at (x, z). */
export function isDecorClear(x: number, z: number): boolean {
  if (Math.hypot(x, z) >= PASTURE_GROUND_RADIUS - 3) return false;
  if (Math.abs(x) < 1.2 && Math.abs(z) < 1.2) return false;
  if (inPlazaFootprint(x, z)) return false;
  if (inPondFootprint(x, z)) return false;
  if (inPadFootprint(x, z)) return false;
  if (inPathFootprint(x, z)) return false;
  if (inFenceFootprint(x, z)) return false;
  return true;
}

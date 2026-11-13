/** Ground height for the public pasture. The walkable paddock is level. */

import { PASTURE_ZONE } from "../world/config/zones";
import { distanceToPasturePath } from "./meadowLayout";

export type FlattenSpot = { x: number; z: number; radius: number };

/** Flatten around spawn, landmarks, and path corridors so props sit level. */
export const PASTURE_FLATTEN: readonly FlattenSpot[] = [
  { x: 0, z: 0, radius: 3.2 },
  { x: 0, z: 6, radius: 2.6 },
  { x: -24, z: 18, radius: 4.5 },
  { x: -18, z: -20, radius: 2.8 },
  { x: 22, z: -16, radius: 4.2 },
  { x: 18, z: 22, radius: 2.6 },
  { x: -16, z: 12, radius: 3.2 },
  { x: 16, z: 12, radius: 3.4 },
  { x: 16, z: -8, radius: 3.2 },
  { x: -30, z: 6, radius: 3.4 },
  { x: 27, z: -16, radius: 3.2 },
  { x: 8, z: -28, radius: 3.2 },
  { x: 12, z: 28, radius: 3.4 },
  { x: -22, z: 26, radius: 3.4 },
  { x: -12, z: -32, radius: 3.4 },
];

const PATH_FLATTEN_RADIUS = 1.7;
/** Distance past the fence over which apron hills fade in. */
const APRON_BLEND = 10;

export function meadowHeightCoarse(x: number, z: number): number {
  return (
    Math.sin(x * 0.055) * Math.cos(z * 0.048) * 0.88 +
    Math.sin((x + z) * 0.07) * 0.1
  );
}

export function meadowRelief(x: number, z: number): number {
  return (
    meadowHeightCoarse(x, z) +
    Math.sin(x * 0.11) * Math.cos(z * 0.09) * 0.42 +
    Math.sin(x * 0.27 + 1.7) * Math.cos(z * 0.23) * 0.16
  );
}

/** 0 inside the walkable 88×88 paddock; grows outside the fence. */
export function distanceOutsidePastureFloor(x: number, z: number): number {
  const { minX, maxX, minZ, maxZ } = PASTURE_ZONE.bounds;
  const dx = Math.max(0, minX - x, x - maxX);
  const dz = Math.max(0, minZ - z, z - maxZ);
  return Math.hypot(dx, dz);
}

function smoothstep01(t: number): number {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
}

/**
 * Walkable pasture stays at ground level (y = 0). A gentle roll is kept
 * only on the visual apron beyond the fence so the meadow still has depth
 * at the horizon. Landmark pads and painted paths also pin to 0.
 */
export function meadowHeight(
  x: number,
  z: number,
  flatten: readonly FlattenSpot[] = PASTURE_FLATTEN,
): number {
  const outside = distanceOutsidePastureFloor(x, z);
  const apron = smoothstep01(outside / APRON_BLEND);
  const y = meadowRelief(x, z) * apron;
  const pathDist = distanceToPasturePath(x, z);
  const pathW =
    pathDist < PATH_FLATTEN_RADIUS
      ? smoothstep01(1 - pathDist / PATH_FLATTEN_RADIUS)
      : 0;
  let wMax = pathW;
  for (const spot of flatten) {
    const d = Math.hypot(x - spot.x, z - spot.z);
    if (d >= spot.radius) continue;
    wMax = Math.max(wMax, smoothstep01(1 - d / spot.radius));
  }
  return y * (1 - wMax);
}

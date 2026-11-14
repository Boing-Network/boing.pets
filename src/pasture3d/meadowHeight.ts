/** Ground height for the public pasture. The walkable paddock is level. */

import { PASTURE_ZONE } from "../world/config/zones";
import { distanceToPasturePath } from "./meadowLayout";

export type FlattenSpot = { x: number; z: number; radius: number };

/** Flatten around spawn, landmarks, and path corridors so props sit level. */
export const PASTURE_FLATTEN: readonly FlattenSpot[] = [
  { x: 0, z: 0, radius: 3.2 },
  {
    x: PASTURE_ZONE.spawn.x,
    z: PASTURE_ZONE.spawn.z,
    radius: 2.6,
  },
  ...PASTURE_ZONE.landmarks.map((item) => ({
    x: item.position.x,
    z: item.position.z,
    radius: Math.max(2.6, Math.hypot(item.width, item.depth) / 2 + 1.4),
  })),
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

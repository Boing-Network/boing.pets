/** Gentle, deterministic rolling height for the public pasture. */

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
];

const PATH_FLATTEN_RADIUS = 1.7;

export function meadowHeight(
  x: number,
  z: number,
  flatten: readonly FlattenSpot[] = PASTURE_FLATTEN,
): number {
  const h =
    Math.sin(x * 0.055) * Math.cos(z * 0.048) * 0.88 +
    Math.sin(x * 0.11) * Math.cos(z * 0.09) * 0.42 +
    Math.sin(x * 0.27 + 1.7) * Math.cos(z * 0.23) * 0.16 +
    Math.sin((x + z) * 0.07) * 0.1;
  let wMax = 0;
  for (const spot of flatten) {
    const d = Math.hypot(x - spot.x, z - spot.z);
    if (d >= spot.radius) continue;
    const t = 1 - d / spot.radius;
    wMax = Math.max(wMax, t * t * (3 - 2 * t));
  }
  const pathDist = distanceToPasturePath(x, z);
  if (pathDist < PATH_FLATTEN_RADIUS) {
    const t = 1 - pathDist / PATH_FLATTEN_RADIUS;
    wMax = Math.max(wMax, t * t * (3 - 2 * t));
  }
  return h * (1 - wMax);
}

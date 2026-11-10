import { PASTURE_ZONE } from "../world/config/zones";

/** Shared meadow tree positions so decor and collision stay in sync. */
export const MEADOW_TREE_SPOTS = [
  [-38, -22],
  [-36, 26],
  [36, -28],
  [38, 24],
  [-42, 6],
  [42, -8],
  [-12, 36],
  [16, 38],
  [-28, -36],
  [30, 36],
  [-38, 36],
  [38, -38],
  [-8, -38],
  [8, 40],
  [-40, -8],
  [24, -38],
  [-32, -14],
  [14, -32],
  [-20, 32],
  [32, 12],
  [-26, 8],
  [28, 28],
  [20, -28],
  [-14, 28],
] as const;

/** Circle that covers the walkable square plus a grass margin. */
export function pastureGroundRadius(
  bounds = PASTURE_ZONE.bounds,
  margin = 6,
): number {
  const halfX = Math.max(Math.abs(bounds.minX), Math.abs(bounds.maxX));
  const halfZ = Math.max(Math.abs(bounds.minZ), Math.abs(bounds.maxZ));
  return Math.ceil(Math.hypot(halfX, halfZ) + margin);
}

export const PASTURE_GROUND_RADIUS = pastureGroundRadius();

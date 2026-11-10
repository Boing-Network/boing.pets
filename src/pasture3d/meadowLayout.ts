import { PASTURE_ZONE } from "../world/config/zones";

export type MeadowPoint = readonly [number, number];
export type FenceSegment = {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
};

/**
 * Grove clusters plus a few lone trees. Positions are the source of truth
 * for both decor and collision.
 */
export const MEADOW_TREE_SPOTS: readonly MeadowPoint[] = [
  // NW grove
  [-36, 26],
  [-32, 30],
  [-38, 30],
  [-30, 28],
  [-37, 22],
  // SW grove
  [-28, -36],
  [-32, -30],
  [-26, -30],
  [-34, -36],
  [-24, -38],
  // SE grove
  [36, -28],
  [32, -32],
  [38, -34],
  [30, -26],
  [38, -24],
  // NE grove
  [30, 36],
  [36, 32],
  [28, 30],
  [34, 38],
  [26, 36],
  // North copse
  [-12, 36],
  [-6, 40],
  [-10, 40],
  // South copse
  [8, -40],
  [14, -32],
  [12, -38],
  // East copse
  [42, -8],
  [40, 6],
  [38, 12],
  // West copse
  [-42, 6],
  [-40, -8],
  [-38, -14],
  // Punctuation
  [24, -38],
  [16, 38],
  [20, -28],
  [-16, 28],
  [-34, 10],
  [28, 28],
  [8, 32],
  [-20, -28],
  // Mid-field copses so the zoomed-out lawn is not a bare bowl
  [10, -18],
  [12, -12],
  [-10, -18],
  [-10, -6],
  [12, 10],
  [-12, 10],
  [4, -22],
  [-6, 22],
  [18, 6],
  [-18, -6],
  [8, 18],
  [20, -22],
  [-14, 20],
  [16, 24],
  [-16, 4],
  [4, -16],
];

/** Soft shrubs. Visual only - pets can walk through. */
export const MEADOW_BUSH_SPOTS: readonly MeadowPoint[] = [
  [-34, 28],
  [-33, 22],
  [-30, 32],
  [-30, -34],
  [-24, -32],
  [-36, -32],
  [34, -30],
  [40, -30],
  [32, -24],
  [32, 34],
  [26, 32],
  [38, 36],
  [-14, 38],
  [-8, 38],
  [10, -36],
  [16, -36],
  [40, 2],
  [36, 8],
  [-38, 2],
  [-36, -10],
  [-22, 12],
  [20, 18],
  [16, -18],
  [-14, -16],
  [6, 20],
  [-6, -22],
  [26, -8],
  [-28, -4],
  [12, -16],
  [14, -12],
  [-8, -16],
  [-8, -4],
  [14, 12],
  [-10, 10],
  [6, -20],
  [-4, 24],
  [20, 8],
  [-16, -4],
  [10, 20],
  [22, -20],
  [-12, 22],
  [6, -14],
  [-14, 6],
  [8, 8],
  [-4, 18],
  [4, 12],
  [8, -8],
  [-8, 4],
];

/** Axis-aligned paddock and garden rails. */
export const MEADOW_FENCES: readonly FenceSegment[] = [
  { x1: -32, z1: 14, x2: -32, z2: 23 },
  { x1: -32, z1: 14, x2: -27, z2: 14 },
  { x1: -32, z1: 23, x2: -27, z2: 23 },
  { x1: 14, z1: 26, x2: 22, z2: 26 },
  { x1: 22, z1: 26, x2: 22, z2: 19 },
];

export const MEADOW_FENCE_HALF_THICK = 0.28;

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

export function pointToSegment(
  px: number,
  pz: number,
  x1: number,
  z1: number,
  x2: number,
  z2: number,
): number {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-6) return Math.hypot(px - x1, pz - z1);
  let t = ((px - x1) * dx + (pz - z1) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + dx * t), pz - (z1 + dz * t));
}

export function distanceToPasturePath(x: number, z: number): number {
  let best = Infinity;
  for (const path of PASTURE_ZONE.paths) {
    const a = path[0];
    const b = path[1];
    if (!a || !b) continue;
    best = Math.min(best, pointToSegment(x, z, a.x, a.z, b.x, b.z));
  }
  return best;
}

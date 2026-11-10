/** Gentle, deterministic rolling height for the public pasture. */

export type FlattenSpot = { x: number; z: number; radius: number };

/** Default flatten around spawn, the pond, barn, and oak so props sit level. */
export const PASTURE_FLATTEN: readonly FlattenSpot[] = [
  { x: 0, z: 0, radius: 3.2 },
  { x: 0, z: 6, radius: 2.6 },
  { x: -24, z: 18, radius: 4.5 },
  { x: -18, z: -20, radius: 2.8 },
  { x: 22, z: -16, radius: 4.2 },
  { x: 18, z: 22, radius: 2.6 },
];

export function meadowHeight(
  x: number,
  z: number,
  flatten: readonly FlattenSpot[] = PASTURE_FLATTEN,
): number {
  let h =
    Math.sin(x * 0.11) * Math.cos(z * 0.09) * 0.42 +
    Math.sin(x * 0.27 + 1.7) * Math.cos(z * 0.23) * 0.16 +
    Math.sin((x + z) * 0.07) * 0.08;
  for (const spot of flatten) {
    const d = Math.hypot(x - spot.x, z - spot.z);
    if (d >= spot.radius) continue;
    const t = 1 - d / spot.radius;
    const w = t * t * (3 - 2 * t);
    h *= 1 - w;
  }
  return h;
}

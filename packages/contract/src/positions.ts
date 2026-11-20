/**
 * Creature position units shared by the kernel and the renderer.
 *
 * Positions are territory-local integers in permille of the territory's
 * radius, with the heart at (0, 0). Land spots stay inside
 * {@link LAND_SPOT_RADIUS}. A spot longer than {@link SHORE_SPOT_THRESHOLD}
 * is a shoreline spot: only its angle matters, and the renderer resolves it
 * to the territory's waterline.
 */
export const SPOT_SCALE = 1000;
export const LAND_SPOT_RADIUS = 900;
export const SHORE_SPOT_THRESHOLD = 1000;
export const SHORE_SPOT_RADIUS = 1200;

export function isShoreSpot(x: number, z: number): boolean {
  return x * x + z * z > SHORE_SPOT_THRESHOLD * SHORE_SPOT_THRESHOLD;
}

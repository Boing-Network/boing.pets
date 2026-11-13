/** Shared ground sampling so pets, nameplates, and terrain agree. */

import { meadowHeight } from "./meadowHeight";

/** Extra lift so feet stay on or above the tessellated grass, never in it. */
export const PASTURE_PET_GROUND_LIFT = 0.05;

export function pasturePetY(x: number, z: number): number {
  return meadowHeight(x, z) + PASTURE_PET_GROUND_LIFT;
}

/**
 * Bounce offset for the pet mesh. Always >= 0 so a downward hop cannot
 * push feet through the grass.
 */
export function pastureHopOffset(
  elapsedSeconds: number,
  moving: boolean,
  reducedMotion = false,
): number {
  if (reducedMotion) return 0;
  const amp = moving ? 0.1 : 0.04;
  const speed = moving ? 11 : 2.4;
  return (Math.sin(elapsedSeconds * speed) * 0.5 + 0.5) * amp;
}

/** Alias so tests and callers share one ground-height function. */
export const pastureGroundHeight = meadowHeight;

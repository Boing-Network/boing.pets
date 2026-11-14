/** Rotate a Yard kit so its local +Z faces the main intersection. */

export const YARD_PLAZA_CENTER = { x: 0, z: 0 } as const;

/** Face the plaza (-Z) so The Drop sits ahead-right of spawn. */
export const PASTURE_SPAWN_YAW = Math.PI;

export function yardFacing(
  x: number,
  z: number,
  toward: { x: number; z: number } = YARD_PLAZA_CENTER,
): number {
  return Math.atan2(toward.x - x, toward.z - z);
}

/** A point `distance` units in front of a station (local +Z after yardFacing). */
export function yardFrontPoint(
  x: number,
  z: number,
  distance: number,
  toward: { x: number; z: number } = YARD_PLAZA_CENTER,
): { x: number; z: number } {
  const rotY = yardFacing(x, z, toward);
  return {
    x: x + Math.sin(rotY) * distance,
    z: z + Math.cos(rotY) * distance,
  };
}

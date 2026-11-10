/** Steering helpers for pasture walk / facing. Pure and testable. */

export type Vec2 = { x: number; z: number };

export function shortestAngleDelta(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Smoothly turn toward `target`, wrapping around ??. `t` is in 0..1. */
export function lerpAngle(current: number, target: number, t: number): number {
  const k = Math.min(1, Math.max(0, t));
  return current + shortestAngleDelta(current, target) * k;
}

export function approachSpeed(
  current: number,
  desired: number,
  dt: number,
  accel = 9,
  decel = 14,
): number {
  if (current < desired) return Math.min(desired, current + accel * dt);
  return Math.max(desired, current - decel * dt);
}

/** Ease the cap as the pet nears the destination so arrivals don't slam. */
export function desiredWalkSpeed(
  distance: number,
  maxSpeed: number,
  arrive = 1.4,
): number {
  if (distance < 0.08) return 0;
  const t = Math.min(1, distance / arrive);
  return maxSpeed * (t * t * (3 - 2 * t));
}

/**
 * A new click always replaces the current destination immediately.
 * There is no path queue: mid-walk retargets are just a new target.
 */
export function retarget(_current: Vec2 | null, next: Vec2): Vec2 {
  return { x: next.x, z: next.z };
}

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

/** Frame-rate-independent blend. `rate` is 1/seconds. */
export function expApproach(
  current: number,
  target: number,
  rate: number,
  dt: number,
): number {
  if (!(dt > 0) || !(rate > 0)) return current;
  const k = 1 - Math.exp(-rate * dt);
  return current + (target - current) * k;
}

export function expApproachAngle(
  current: number,
  target: number,
  rate: number,
  dt: number,
): number {
  if (!(dt > 0) || !(rate > 0)) return current;
  const k = 1 - Math.exp(-rate * dt);
  return lerpAngle(current, target, k);
}

/**
 * Move a planar velocity toward `desired`. Stopping uses `decel`; speeding
 * up or changing direction uses `accel`. The step never overshoots.
 */
export function approachVec(
  current: Vec2,
  desired: Vec2,
  dt: number,
  accel: number,
  decel: number,
): Vec2 {
  const dx = desired.x - current.x;
  const dz = desired.z - current.z;
  const dist = Math.hypot(dx, dz);
  if (!(dt > 0) || dist <= 1e-5) return { x: desired.x, z: desired.z };
  const currentSpeed = Math.hypot(current.x, current.z);
  const desiredSpeed = Math.hypot(desired.x, desired.z);
  let rate = accel;
  if (desiredSpeed < 1e-4) {
    rate = decel;
  } else if (currentSpeed > 1e-4) {
    const dot =
      (current.x * desired.x + current.z * desired.z) /
      (currentSpeed * desiredSpeed);
    if (dot > 0.5 && currentSpeed > desiredSpeed + 0.01) rate = decel;
  }
  const step = Math.min(dist, Math.max(0, rate) * dt);
  return {
    x: current.x + (dx / dist) * step,
    z: current.z + (dz / dist) * step,
  };
}

/**
 * Critically damped follow (Unity SmoothDamp). Stable at low and high frame
 * rates; the overshoot clamp keeps a step response from crossing the target.
 */
export function smoothDamp(
  current: number,
  target: number,
  velocity: number,
  smoothTime: number,
  dt: number,
  maxSpeed = Infinity,
): { value: number; velocity: number } {
  if (!(dt > 0) || !Number.isFinite(current) || !Number.isFinite(target)) {
    return { value: current, velocity };
  }
  const smooth = Math.max(0.0001, smoothTime);
  const omega = 2 / smooth;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  let change = current - target;
  const maxChange = maxSpeed * smooth;
  if (Number.isFinite(maxChange)) {
    change = Math.max(-maxChange, Math.min(maxChange, change));
  }
  const adjustedTarget = current - change;
  const temp = (velocity + omega * change) * dt;
  let nextVel = (velocity - omega * temp) * exp;
  let value = adjustedTarget + (change + temp) * exp;
  if (target - current > 0 === value > target) {
    value = target;
    nextVel = 0;
  }
  return { value, velocity: nextVel };
}

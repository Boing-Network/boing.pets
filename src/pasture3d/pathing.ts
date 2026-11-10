import type { WorldZoneConfig } from "../world/config/zones";

export type Vec2 = { x: number; z: number };

export type Obstacle = { x: number; z: number; radius: number };

const PET_RADIUS = 0.5;

export function obstaclesForZone(zone: WorldZoneConfig): Obstacle[] {
  return zone.landmarks
    .filter((item) => item.height >= 1)
    .map((item) => ({
      x: item.position.x,
      z: item.position.z,
      radius: Math.max(item.width, item.depth) * 0.45 + PET_RADIUS,
    }));
}

export function clampToBounds(pos: Vec2, zone: WorldZoneConfig): Vec2 {
  return {
    x: Math.min(zone.bounds.maxX, Math.max(zone.bounds.minX, pos.x)),
    z: Math.min(zone.bounds.maxZ, Math.max(zone.bounds.minZ, pos.z)),
  };
}

function blocked(pos: Vec2, obstacles: Obstacle[]): Obstacle | null {
  for (const o of obstacles) {
    if (Math.hypot(pos.x - o.x, pos.z - o.z) < o.radius) return o;
  }
  return null;
}

function slide(pos: Vec2, next: Vec2, hit: Obstacle): Vec2 {
  const dx = next.x - hit.x;
  const dz = next.z - hit.z;
  const len = Math.hypot(dx, dz) || 1;
  const pushed = {
    x: hit.x + (dx / len) * hit.radius,
    z: hit.z + (dz / len) * hit.radius,
  };
  // Prefer the axis that keeps more of the intended step.
  const onlyX = { x: next.x, z: pos.z };
  const onlyZ = { x: pos.x, z: next.z };
  if (!blocked(onlyX, [hit])) return onlyX;
  if (!blocked(onlyZ, [hit])) return onlyZ;
  return pushed;
}

export function stepToward(
  pos: Vec2,
  target: Vec2,
  dt: number,
  speed: number,
  zone: WorldZoneConfig,
  obstacles: Obstacle[],
): { pos: Vec2; arrived: boolean; yaw: number | null } {
  const dx = target.x - pos.x;
  const dz = target.z - pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.08)
    return { pos: clampToBounds(pos, zone), arrived: true, yaw: null };
  const step = Math.min(dist, speed * dt);
  let next = {
    x: pos.x + (dx / dist) * step,
    z: pos.z + (dz / dist) * step,
  };
  next = clampToBounds(next, zone);
  const hit = blocked(next, obstacles);
  if (hit) next = clampToBounds(slide(pos, next, hit), zone);
  return {
    pos: next,
    arrived: Math.hypot(target.x - next.x, target.z - next.z) < 0.08,
    yaw: Math.atan2(next.x - pos.x, next.z - pos.z),
  };
}

export function randomWanderTarget(
  seed: number,
  zone: WorldZoneConfig,
  obstacles: Obstacle[],
): Vec2 {
  const { minX, maxX, minZ, maxZ } = zone.bounds;
  for (let i = 0; i < 8; i++) {
    const t = ((seed + i * 9973) >>> 0) / 0xffffffff;
    const u = ((seed * 13 + i * 7919) >>> 0) / 0xffffffff;
    const candidate = {
      x: minX + 2 + t * (maxX - minX - 4),
      z: minZ + 2 + u * (maxZ - minZ - 4),
    };
    if (!blocked(candidate, obstacles)) return candidate;
  }
  return { x: zone.spawn.x, z: zone.spawn.z };
}

export function seedPose(
  owner: string,
  index: number,
  zone: WorldZoneConfig,
): Vec2 {
  let h = 2166136261;
  const text = owner + ":" + index;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h >>>= 0;
  const x =
    zone.bounds.minX +
    3 +
    ((h % 8000) / 8000) * (zone.bounds.maxX - zone.bounds.minX - 6);
  const z =
    zone.bounds.minZ +
    3 +
    (((h >>> 8) % 8000) / 8000) * (zone.bounds.maxZ - zone.bounds.minZ - 6);
  return { x, z };
}

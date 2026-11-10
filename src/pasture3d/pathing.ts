import type { WorldLandmark, WorldZoneConfig } from "../world/config/zones";
import { WORLD_CONFIG } from "../world/config/zones";
import { MEADOW_TREE_SPOTS } from "./meadowLayout";

export type Vec2 = { x: number; z: number };

export type Obstacle = {
  id?: string;
  x: number;
  z: number;
  /** Circle / ellipse radii. Always set. */
  halfW: number;
  halfD: number;
  /** "aabb" for buildings, "circle" for trees, pond, trunks. */
  shape: "aabb" | "circle";
};

const PET_RADIUS = 0.55;

export function isSolidLandmark(item: WorldLandmark): boolean {
  if (item.id === "lily-pond") return true;
  if (item.id === "wildflowers") return false;
  return item.height >= 1;
}

export function obstaclesForZone(zone: WorldZoneConfig): Obstacle[] {
  const list: Obstacle[] = [];
  for (const item of zone.landmarks) {
    if (!isSolidLandmark(item)) continue;
    const pad = PET_RADIUS;
    const shape: Obstacle["shape"] =
      item.height >= 1 && Math.abs(item.width - item.depth) > 0.4
        ? "aabb"
        : "circle";
    list.push({
      id: item.id,
      x: item.position.x,
      z: item.position.z,
      halfW: item.width / 2 + pad,
      halfD: item.depth / 2 + pad,
      shape,
    });
  }
  if (zone.id === "pasture") {
    for (const [x, z] of MEADOW_TREE_SPOTS) {
      list.push({
        id: "meadow-tree",
        x,
        z,
        halfW: 0.85,
        halfD: 0.85,
        shape: "circle",
      });
    }
  }
  return list;
}

export function clampToBounds(pos: Vec2, zone: WorldZoneConfig): Vec2 {
  return {
    x: Math.min(zone.bounds.maxX, Math.max(zone.bounds.minX, pos.x)),
    z: Math.min(zone.bounds.maxZ, Math.max(zone.bounds.minZ, pos.z)),
  };
}

export function blockedBy(pos: Vec2, o: Obstacle): boolean {
  const dx = pos.x - o.x;
  const dz = pos.z - o.z;
  if (o.shape === "aabb") {
    return Math.abs(dx) < o.halfW && Math.abs(dz) < o.halfD;
  }
  const nx = dx / o.halfW;
  const nz = dz / o.halfD;
  return nx * nx + nz * nz < 1;
}

export function blocked(pos: Vec2, obstacles: Obstacle[]): Obstacle | null {
  for (const o of obstacles) {
    if (blockedBy(pos, o)) return o;
  }
  return null;
}

function pushOutOf(pos: Vec2, o: Obstacle): Vec2 {
  const dx = pos.x - o.x;
  const dz = pos.z - o.z;
  if (o.shape === "aabb") {
    const gapX = o.halfW - Math.abs(dx);
    const gapZ = o.halfD - Math.abs(dz);
    if (gapX < gapZ) {
      return { x: o.x + Math.sign(dx || 1) * o.halfW, z: pos.z };
    }
    return { x: pos.x, z: o.z + Math.sign(dz || 1) * o.halfD };
  }
  const nx = dx / o.halfW;
  const nz = dz / o.halfD;
  const len = Math.hypot(nx, nz) || 1;
  return {
    x: o.x + (nx / len) * o.halfW,
    z: o.z + (nz / len) * o.halfD,
  };
}

export function pushOut(pos: Vec2, obstacles: Obstacle[]): Vec2 {
  let cur = pos;
  for (let i = 0; i < 6; i++) {
    const hit = blocked(cur, obstacles);
    if (!hit) return cur;
    cur = pushOutOf(cur, hit);
  }
  return cur;
}

export function clampToWalkable(
  pos: Vec2,
  zone: WorldZoneConfig,
  obstacles: Obstacle[],
): Vec2 {
  return pushOut(clampToBounds(pos, zone), obstacles);
}

/** Clicked points inside a solid are snapped to the nearest reachable rim. */
export function resolveClickTarget(
  click: Vec2,
  zone: WorldZoneConfig,
  obstacles: Obstacle[],
): Vec2 {
  return clampToWalkable(click, zone, obstacles);
}

function cornersOf(o: Obstacle, out = 0.4): Vec2[] {
  return [
    { x: o.x - o.halfW - out, z: o.z - o.halfD - out },
    { x: o.x - o.halfW - out, z: o.z + o.halfD + out },
    { x: o.x + o.halfW + out, z: o.z - o.halfD - out },
    { x: o.x + o.halfW + out, z: o.z + o.halfD + out },
  ];
}

function segmentHits(a: Vec2, b: Vec2, o: Obstacle): boolean {
  const steps = 14;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (blockedBy({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }, o))
      return true;
  }
  return false;
}

function firstHitOnSegment(
  a: Vec2,
  b: Vec2,
  obstacles: Obstacle[],
): Obstacle | null {
  for (const o of obstacles) {
    if (segmentHits(a, b, o)) return o;
  }
  return null;
}

/**
 * If the straight line to the goal cuts a solid, steer via the cheapest
 * outward corner so pets slide/route around instead of walking in.
 */
export function aroundWaypoint(
  pos: Vec2,
  goal: Vec2,
  obstacles: Obstacle[],
): Vec2 {
  const hit = firstHitOnSegment(pos, goal, obstacles);
  if (!hit) return goal;
  let best: Vec2 | null = null;
  let bestCost = Infinity;
  for (const c of cornersOf(hit)) {
    if (blocked(c, obstacles)) continue;
    if (segmentHits(pos, c, hit)) continue;
    // Don't sit on a corner whose straight line to the goal still
    // cuts the solid ? walk to a different corner that can see it.
    const alreadyHere = Math.hypot(c.x - pos.x, c.z - pos.z) < 0.25;
    const clearToGoal = !segmentHits(c, goal, hit);
    if (alreadyHere && !clearToGoal) continue;
    const cost =
      Math.hypot(c.x - pos.x, c.z - pos.z) +
      Math.hypot(goal.x - c.x, goal.z - c.z) +
      (clearToGoal ? 0 : 40);
    if (cost < bestCost) {
      bestCost = cost;
      best = c;
    }
  }
  return best ?? pushOutOf(pos, hit);
}

function slide(pos: Vec2, next: Vec2, hit: Obstacle): Vec2 {
  const onlyX = { x: next.x, z: pos.z };
  const onlyZ = { x: pos.x, z: next.z };
  if (!blockedBy(onlyX, hit)) return onlyX;
  if (!blockedBy(onlyZ, hit)) return onlyZ;
  return pushOutOf(next, hit);
}

export function stepToward(
  pos: Vec2,
  target: Vec2,
  dt: number,
  speed: number,
  zone: WorldZoneConfig,
  obstacles: Obstacle[],
): { pos: Vec2; arrived: boolean; yaw: number | null } {
  const goal = clampToWalkable(target, zone, obstacles);
  const here = clampToWalkable(pos, zone, obstacles);
  const remain = Math.hypot(goal.x - here.x, goal.z - here.z);
  if (remain < 0.08) return { pos: here, arrived: true, yaw: null };
  const waypoint = aroundWaypoint(here, goal, obstacles);
  const dx = waypoint.x - here.x;
  const dz = waypoint.z - here.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.04) return { pos: here, arrived: remain < 0.12, yaw: null };
  const step = Math.min(dist, speed * dt);
  let next = {
    x: here.x + (dx / dist) * step,
    z: here.z + (dz / dist) * step,
  };
  next = clampToBounds(next, zone);
  const hit = blocked(next, obstacles);
  if (hit) next = clampToBounds(slide(here, next, hit), zone);
  next = clampToWalkable(next, zone, obstacles);
  const left = Math.hypot(goal.x - next.x, goal.z - next.z);
  const moved = Math.hypot(next.x - here.x, next.z - here.z);
  return {
    pos: next,
    arrived: left < 0.08 || (moved < 1e-4 && left < 0.35),
    yaw: moved > 1e-4 ? Math.atan2(next.x - here.x, next.z - here.z) : null,
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
  obstacles: Obstacle[] = obstaclesForZone(zone),
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
  return clampToWalkable({ x, z }, zone, obstacles);
}

/** Shared client/server clamp so the DO and the walker agree. */
export function clampPresencePosition(
  zoneId: string,
  x: number,
  y: number,
  z: number,
): { x: number; y: number; z: number } {
  const zone =
    WORLD_CONFIG.zones.find((item) => item.id === zoneId) ??
    WORLD_CONFIG.zones[0]!;
  const p = clampToWalkable({ x, z }, zone, obstaclesForZone(zone));
  return { x: p.x, y, z: p.z };
}

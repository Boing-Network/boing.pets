import type { WorldLandmark, WorldZoneConfig } from "../world/config/zones";
import { WORLD_CONFIG } from "../world/config/zones";
import {
  MEADOW_FENCE_HALF_THICK,
  MEADOW_FENCES,
  MEADOW_TREE_SPOTS,
} from "./meadowLayout";

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
    for (const [i, rail] of MEADOW_FENCES.entries()) {
      const midX = (rail.x1 + rail.x2) / 2;
      const midZ = (rail.z1 + rail.z2) / 2;
      const alongX = Math.abs(rail.x2 - rail.x1);
      const alongZ = Math.abs(rail.z2 - rail.z1);
      list.push({
        id: "meadow-fence-" + i,
        x: midX,
        z: midZ,
        halfW:
          (alongX > alongZ ? alongX / 2 + 0.15 : MEADOW_FENCE_HALF_THICK) +
          PET_RADIUS,
        halfD:
          (alongZ > alongX ? alongZ / 2 + 0.15 : MEADOW_FENCE_HALF_THICK) +
          PET_RADIUS,
        shape: "aabb",
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

function detourPad(o: Obstacle): number {
  return Math.max(0.7, 0.18 * Math.max(o.halfW, o.halfD));
}

/** Rim samples used to steer around a solid. Ellipses need more than
 * four AABB corners or a long detour (pond + pier) can pin the walker. */
function detourPoints(o: Obstacle, out = detourPad(o)): Vec2[] {
  if (o.shape === "circle") {
    const pts: Vec2[] = [];
    const steps = 12;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      pts.push({
        x: o.x + Math.cos(a) * (o.halfW + out),
        z: o.z + Math.sin(a) * (o.halfD + out),
      });
    }
    return pts;
  }
  // Corners only: edge midpoints on the near face sit closer than the
  // far corners and make the walker oscillate along the wall.
  const padW = o.halfW + out;
  const padD = o.halfD + out;
  return [
    { x: o.x - padW, z: o.z - padD },
    { x: o.x - padW, z: o.z + padD },
    { x: o.x + padW, z: o.z - padD },
    { x: o.x + padW, z: o.z + padD },
  ];
}

function nearbyDetours(
  pos: Vec2,
  goal: Vec2,
  hit: Obstacle,
  obstacles: Obstacle[],
): Vec2[] {
  const pts: Vec2[] = [];
  const seen = new Set<string>();
  const add = (p: Vec2) => {
    const key = `${p.x.toFixed(3)},${p.z.toFixed(3)}`;
    if (seen.has(key)) return;
    seen.add(key);
    pts.push(p);
  };
  for (const o of obstacles) {
    const close =
      o === hit ||
      segmentHits(pos, goal, o) ||
      Math.hypot(o.x - pos.x, o.z - pos.z) < 10 ||
      Math.hypot(o.x - hit.x, o.z - hit.z) < 8;
    if (!close) continue;
    for (const p of detourPoints(o)) add(p);
  }
  return pts;
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
 * outward rim sample so pets slide/route around instead of walking in.
 * Candidates come from the first hit and any nearby solids (the pier
 * sits on the lily pond's east bank) and must be reachable without
 * crossing any obstacle, not just the one that blocked the goal.
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
  for (const c of nearbyDetours(pos, goal, hit, obstacles)) {
    if (blocked(c, obstacles)) continue;
    if (firstHitOnSegment(pos, c, obstacles)) continue;
    // A candidate only has to clear the solid we are routing around
    // to be 'able to see the goal'. Other solids are handled on later
    // steps; requiring a fully clear line made walkers oscillate on
    // the near side of a barn or pond.
    const alreadyHere = Math.hypot(c.x - pos.x, c.z - pos.z) < 0.25;
    const clearHit = !segmentHits(c, goal, hit);
    const clearToGoal = !firstHitOnSegment(c, goal, obstacles);
    if (alreadyHere && !clearHit) continue;
    const recede =
      Math.hypot(goal.x - c.x, goal.z - c.z) -
      Math.hypot(goal.x - pos.x, goal.z - pos.z);
    const cost =
      Math.hypot(c.x - pos.x, c.z - pos.z) +
      Math.hypot(goal.x - c.x, goal.z - c.z) +
      (clearToGoal ? 0 : clearHit ? 12 : 80) +
      (recede > 0 && !clearHit ? recede * 8 : 0);
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

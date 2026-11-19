/**
 * The presentation world: the plan rasterised onto a height grid with water
 * cut into it. Everything the renderer needs to draw terrain, water and flora,
 * and to stand a creature on the ground, is answered from these grids.
 *
 * View-only. Built from (seed, territory graph); never saved, never fed back
 * to the simulation.
 */
import { clamp, mix, smoothstep } from "./noise";
import {
  SEA_LEVEL,
  planWorld,
  type Region,
  type WaterBody,
  type WorldInput,
  type WorldPlan,
} from "./world-plan";

export const WaterCell = {
  NONE: 0,
  RIVER: 1,
  POND: 2,
  SWAMP: 3,
  TARN: 4,
} as const;

const NO_WATER = 60;
const TARGET_CELL = 1.25;
const MAX_CELLS = 380_000;

type CarveProfile = {
  depth: number;
  shelf: number;
  bank: number;
  rise: number;
};

const BODY_PROFILE: Record<WaterBody["kind"], CarveProfile> = {
  pond: { depth: 2.4, shelf: 7, bank: 10, rise: 0.05 },
  swamp: { depth: 0.6, shelf: 3, bank: 9, rise: 0.018 },
  tarn: { depth: 1.9, shelf: 4, bank: 7, rise: 0.09 },
};

function profileFor(kind: number, halfWidth: number): CarveProfile {
  switch (kind) {
    case WaterCell.POND:
      return BODY_PROFILE.pond;
    case WaterCell.SWAMP:
      return BODY_PROFILE.swamp;
    case WaterCell.TARN:
      return BODY_PROFILE.tarn;
    default:
      return {
        depth: 0.35 + halfWidth * 0.24,
        shelf: Math.max(0.8, halfWidth * 0.9),
        bank: 7,
        rise: 0.08,
      };
  }
}

function cellKind(kind: WaterBody["kind"]): number {
  return kind === "pond"
    ? WaterCell.POND
    : kind === "swamp"
      ? WaterCell.SWAMP
      : WaterCell.TARN;
}

export type WorldModel = WorldPlan & {
  cell: number;
  nx: number;
  nz: number;
  originX: number;
  originZ: number;
  /** Final ground height per grid vertex. */
  height: Float32Array;
  /** Signed distance to the nearest inland water edge; negative in water. */
  waterDist: Float32Array;
  /** Surface height of that water; the sea level where there is none. */
  waterLevel: Float32Array;
  waterKind: Uint8Array;
  /** Per vertex: flow dir x, flow dir z, speed, rapids. */
  flow: Float32Array;
  /** Per vertex: position across the channel (-1…1), distance along it. */
  riverCoord: Float32Array;
  trailDist: Float32Array;
  regionByTerritoryId: Map<number, Region>;
  /** Index of the grid vertex nearest to a point, for reading the grids. */
  cellAt: (x: number, z: number) => number;
  heightAt: (x: number, z: number) => number;
  slopeAt: (x: number, z: number) => number;
  waterDistAt: (x: number, z: number) => number;
  /** Water surface height above this point, or null on dry ground. */
  waterSurfaceAt: (x: number, z: number) => number | null;
  trailDistAt: (x: number, z: number) => number;
  /** Territory whose region this point belongs to most, or null in the wilds. */
  regionAt: (x: number, z: number) => Region | null;
};

export function buildWorldModel(input: WorldInput): WorldModel {
  const plan = planWorld(input);
  const { bounds } = plan;
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  const cell = Math.max(TARGET_CELL, Math.sqrt((width * depth) / MAX_CELLS));
  const nx = Math.ceil(width / cell) + 1;
  const nz = Math.ceil(depth / cell) + 1;
  const originX = bounds.minX;
  const originZ = bounds.minZ;
  const count = nx * nz;

  const height = new Float32Array(count);
  const waterDist = new Float32Array(count).fill(NO_WATER);
  const waterLevel = new Float32Array(count).fill(SEA_LEVEL);
  const waterKind = new Uint8Array(count);
  const halfWidths = new Float32Array(count);
  const flow = new Float32Array(count * 4);
  const riverCoord = new Float32Array(count * 2);
  const trailDist = new Float32Array(count).fill(NO_WATER);

  for (let iz = 0; iz < nz; iz += 1) {
    const z = originZ + iz * cell;
    for (let ix = 0; ix < nx; ix += 1) {
      height[iz * nx + ix] = plan.baseHeight(originX + ix * cell, z);
    }
  }

  const range = (lo: number, hi: number, origin: number, n: number) =>
    [
      clamp(Math.floor((lo - origin) / cell), 0, n - 1),
      clamp(Math.ceil((hi - origin) / cell), 0, n - 1),
    ] as const;

  // Still water. Each body drifts gently from where rivers enter to where
  // they leave; swamps barely move.
  for (const body of plan.bodies) {
    let inX = 0;
    let inZ = 0;
    let ins = 0;
    let outX = 0;
    let outZ = 0;
    let outs = 0;
    for (const river of plan.rivers) {
      if (river.toBody === body.id) {
        const p = river.points[river.points.length - 1]!;
        inX += p.x;
        inZ += p.z;
        ins += 1;
      }
      if (river.fromBody === body.id) {
        const p = river.points[0]!;
        outX += p.x;
        outZ += p.z;
        outs += 1;
      }
    }
    let driftX = 0;
    let driftZ = 0;
    if (ins > 0 && outs > 0) {
      const dx = outX / outs - inX / ins;
      const dz = outZ / outs - inZ / ins;
      const len = Math.hypot(dx, dz) || 1;
      driftX = dx / len;
      driftZ = dz / len;
    }
    const speed = body.kind === "swamp" ? 0.07 : 0.3;
    const profile = BODY_PROFILE[body.kind];
    const reach = body.radius * 1.9 + profile.bank + 2;
    const [x0, x1] = range(
      body.center.x - reach,
      body.center.x + reach,
      originX,
      nx,
    );
    const [z0, z1] = range(
      body.center.z - reach,
      body.center.z + reach,
      originZ,
      nz,
    );
    for (let iz = z0; iz <= z1; iz += 1) {
      for (let ix = x0; ix <= x1; ix += 1) {
        const i = iz * nx + ix;
        const d = plan.bodySdf(body, originX + ix * cell, originZ + iz * cell);
        if (d >= waterDist[i]! || d > profile.bank) continue;
        waterDist[i] = d;
        waterLevel[i] = body.level;
        waterKind[i] = cellKind(body.kind);
        flow[i * 4] = driftX;
        flow[i * 4 + 1] = driftZ;
        flow[i * 4 + 2] = speed;
        flow[i * 4 + 3] = 0;
      }
    }
  }

  // Running water.
  for (const river of plan.rivers) {
    for (let s = 1; s < river.points.length; s += 1) {
      const a = river.points[s - 1]!;
      const b = river.points[s]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len2 = dx * dx + dz * dz;
      if (len2 === 0) continue;
      const len = Math.sqrt(len2);
      const tx = dx / len;
      const tz = dz / len;
      const reach = Math.max(a.halfWidth, b.halfWidth) + 7 + cell;
      const [x0, x1] = range(
        Math.min(a.x, b.x) - reach,
        Math.max(a.x, b.x) + reach,
        originX,
        nx,
      );
      const [z0, z1] = range(
        Math.min(a.z, b.z) - reach,
        Math.max(a.z, b.z) + reach,
        originZ,
        nz,
      );
      for (let iz = z0; iz <= z1; iz += 1) {
        const pz = originZ + iz * cell;
        for (let ix = x0; ix <= x1; ix += 1) {
          const px = originX + ix * cell;
          const t = clamp(((px - a.x) * dx + (pz - a.z) * dz) / len2, 0, 1);
          const ox = px - (a.x + dx * t);
          const oz = pz - (a.z + dz * t);
          const halfWidth = mix(a.halfWidth, b.halfWidth, t);
          const d = Math.hypot(ox, oz) - halfWidth;
          const i = iz * nx + ix;
          if (d >= waterDist[i]! || d > 7) continue;
          waterDist[i] = d;
          waterLevel[i] = mix(a.level, b.level, t);
          waterKind[i] = WaterCell.RIVER;
          halfWidths[i] = halfWidth;
          flow[i * 4] = tx;
          flow[i * 4 + 1] = tz;
          flow[i * 4 + 2] = mix(a.speed, b.speed, t);
          flow[i * 4 + 3] = mix(a.rapids, b.rapids, t);
          riverCoord[i * 2] = clamp((tx * oz - tz * ox) / halfWidth, -1.6, 1.6);
          riverCoord[i * 2 + 1] = mix(a.along, b.along, t);
        }
      }
    }
  }

  // Cut the beds and ease the banks into the surrounding ground.
  for (let i = 0; i < count; i += 1) {
    const d = waterDist[i]!;
    if (d >= NO_WATER) continue;
    const profile = profileFor(waterKind[i]!, halfWidths[i]!);
    const level = waterLevel[i]!;
    if (d <= 0) {
      // Zero slope at the waterline: every shore starts as a shallow.
      height[i] = level - profile.depth * smoothstep(0, profile.shelf, -d);
    } else if (d < profile.bank) {
      const ground = height[i]!;
      const shore = level + d * profile.rise;
      const eased = mix(shore, ground, smoothstep(0, profile.bank, d));
      // Dry banks stay dry: ground that dips just under the waterline is
      // lifted to a low shore. Ground far below it (the sea at a river
      // mouth) is left alone.
      const lift = smoothstep(level - 1.6, level - 0.3, ground);
      const floor = level + 0.03 + Math.min(d, 2.5) * 0.04;
      height[i] = mix(eased, Math.max(eased, floor), lift);
    }
  }

  for (const trail of plan.trails) {
    for (let s = 1; s < trail.points.length; s += 1) {
      const a = trail.points[s - 1]!;
      const b = trail.points[s]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len2 = dx * dx + dz * dz;
      if (len2 === 0) continue;
      const [x0, x1] = range(
        Math.min(a.x, b.x) - 8,
        Math.max(a.x, b.x) + 8,
        originX,
        nx,
      );
      const [z0, z1] = range(
        Math.min(a.z, b.z) - 8,
        Math.max(a.z, b.z) + 8,
        originZ,
        nz,
      );
      for (let iz = z0; iz <= z1; iz += 1) {
        const pz = originZ + iz * cell;
        for (let ix = x0; ix <= x1; ix += 1) {
          const px = originX + ix * cell;
          const t = clamp(((px - a.x) * dx + (pz - a.z) * dz) / len2, 0, 1);
          const d = Math.hypot(px - (a.x + dx * t), pz - (a.z + dz * t));
          const i = iz * nx + ix;
          if (d < trailDist[i]!) trailDist[i] = d;
        }
      }
    }
  }

  function bilinear(grid: Float32Array, x: number, z: number): number {
    const gx = clamp((x - originX) / cell, 0, nx - 1.001);
    const gz = clamp((z - originZ) / cell, 0, nz - 1.001);
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const fx = gx - ix;
    const fz = gz - iz;
    const i = iz * nx + ix;
    const a = grid[i]!;
    const b = grid[i + 1]!;
    const c = grid[i + nx]!;
    const d = grid[i + nx + 1]!;
    return (
      a * (1 - fx) * (1 - fz) +
      b * fx * (1 - fz) +
      c * (1 - fx) * fz +
      d * fx * fz
    );
  }

  function nearest(x: number, z: number): number {
    const ix = clamp(Math.round((x - originX) / cell), 0, nx - 1);
    const iz = clamp(Math.round((z - originZ) / cell), 0, nz - 1);
    return iz * nx + ix;
  }

  const heightAt = (x: number, z: number) => bilinear(height, x, z);

  function slopeAt(x: number, z: number): number {
    const e = cell;
    const gx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
    const gz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
    return Math.hypot(gx, gz);
  }

  function waterSurfaceAt(x: number, z: number): number | null {
    const i = nearest(x, z);
    const level = waterDist[i]! < 4 ? waterLevel[i]! : SEA_LEVEL;
    return heightAt(x, z) < level - 0.015 ? level : null;
  }

  const weights = new Float32Array(Math.max(1, plan.regions.length));
  function regionAt(x: number, z: number): Region | null {
    const wild = plan.regionWeights(x, z, weights);
    let best = -1;
    let bestWeight = wild;
    for (let i = 0; i < plan.regions.length; i += 1) {
      if (weights[i]! > bestWeight) {
        bestWeight = weights[i]!;
        best = i;
      }
    }
    return best < 0 ? null : plan.regions[best]!;
  }

  return {
    ...plan,
    cell,
    nx,
    nz,
    originX,
    originZ,
    height,
    waterDist,
    waterLevel,
    waterKind,
    flow,
    riverCoord,
    trailDist,
    regionByTerritoryId: new Map(plan.regions.map((r) => [r.territoryId, r])),
    cellAt: nearest,
    heightAt,
    slopeAt,
    waterDistAt: (x, z) => bilinear(waterDist, x, z),
    waterSurfaceAt,
    trailDistAt: (x, z) => bilinear(trailDist, x, z),
    regionAt,
  };
}

/** Stable key: the world is rebuilt only when the graph itself changes. */
export function worldModelKey(input: WorldInput): string {
  const territories = [...input.territories]
    .sort((a, b) => a.id - b.id)
    .map(
      (t) =>
        `${t.id}:${t.slug}:${t.name}:${t.foodAbundance}:${t.danger}:${t.capacity}`,
    );
  const links = [...input.links]
    .map((l) => `${l.fromId}>${l.toId}:${l.travelTicks}`)
    .sort();
  return `${input.seed}|${territories.join(",")}|${links.join(",")}`;
}

/** Cached model entry keyed by `worldModelKey`. */
export type WorldModelCache = {
  key: string;
  model: WorldModel;
};

/**
 * Reuse one WorldModel across host snapshots while the territory graph is
 * unchanged. Live hosts replace territory/link array identity every tick;
 * rebuilding would reset the camera and snap creature anchors home.
 */
export function resolveWorldModel(
  cache: WorldModelCache | null,
  input: WorldInput | null,
): WorldModelCache | null {
  if (input == null) return null;
  const key = worldModelKey(input);
  if (cache?.key === key) return cache;
  return { key, model: buildWorldModel(input) };
}

/**
 * World plan: where the territory regions sit, how high the ground is, and
 * where water runs. Presentation only. The territory graph stays the
 * simulation truth; this turns it into one continuous landscape, derived
 * deterministically from the world seed and the graph so a reload redraws the
 * same map.
 */
import { BIOMES, WILD, biomeForTerritory, type Biome } from "./biomes";
import {
  clamp,
  fbm,
  hash01,
  mix,
  ridged,
  smoothstep,
  valueNoise,
} from "./noise";

export type Vec2 = { x: number; z: number };

export type TerritoryInput = {
  id: number;
  slug: string;
  name: string;
  foodAbundance: number;
  danger: number;
  capacity: number;
};

export type LinkInput = { fromId: number; toId: number; travelTicks: number };

export type WorldInput = {
  seed: number;
  territories: readonly TerritoryInput[];
  links: readonly LinkInput[];
};

export type Region = {
  index: number;
  territoryId: number;
  slug: string;
  name: string;
  biome: Biome;
  center: Vec2;
  radius: number;
  elevation: number;
  /** Unit vector toward the side of the region that holds its water. */
  waterSide: Vec2;
  /** Peak of the high ground behind a ridge region, if any. */
  peak: Vec2 | null;
};

export type Lobe = { x: number; z: number; r: number };

export type WaterBody = {
  id: number;
  regionIndex: number;
  kind: Biome["water"];
  center: Vec2;
  radius: number;
  level: number;
  lobes: Lobe[];
};

export type RiverPoint = {
  x: number;
  z: number;
  /** Water surface height. Never rises downstream. */
  level: number;
  halfWidth: number;
  /** Distance from the river start, along the channel. */
  along: number;
  /** Surface speed in world units per second. */
  speed: number;
  /** 0 calm … 1 white water. */
  rapids: number;
};

export type River = {
  id: number;
  /** Body the river leaves, or null for a mountain spring. */
  fromBody: number | null;
  /** Body the river feeds, or null when it runs out to the sea. */
  toBody: number | null;
  points: RiverPoint[];
};

export type Trail = {
  fromId: number;
  toId: number;
  points: Vec2[];
};

export type Ford = { x: number; z: number; level: number; dir: Vec2 };

/** Untamed land around the territories: fills the island out. */
export type WildLobe = { x: number; z: number; r: number; hill: number };

export type WorldPlan = {
  seed: number;
  regions: Region[];
  wilds: WildLobe[];
  bodies: WaterBody[];
  rivers: River[];
  trails: Trail[];
  fords: Ford[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Ground height before any water is cut into it. */
  baseHeight: (x: number, z: number) => number;
  /** Signed distance to a still water body: negative inside. */
  bodySdf: (body: WaterBody, x: number, z: number) => number;
  /** Fills `out` with one weight per region; returns the wild remainder. */
  regionWeights: (x: number, z: number, out: Float32Array) => number;
};

export const SEA_LEVEL = 0;
const LAND_MARGIN = 40;
const WORLD_MARGIN = 80;

function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

function distToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t =
    len2 === 0 ? 0 : clamp(((px - ax) * dx + (pz - az) * dz) / len2, 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

function normalize(x: number, z: number, fallback: Vec2): Vec2 {
  const len = Math.hypot(x, z);
  if (len < 1e-6) return fallback;
  return { x: x / len, z: z / len };
}

type Adjacency = Map<number, Array<{ id: number; ticks: number }>>;

function buildAdjacency(input: WorldInput): Adjacency {
  const known = new Set(input.territories.map((t) => t.id));
  const adjacency: Adjacency = new Map();
  for (const t of input.territories) adjacency.set(t.id, []);
  for (const link of input.links) {
    if (!known.has(link.fromId) || !known.has(link.toId)) continue;
    if (link.fromId === link.toId) continue;
    for (const [a, b] of [
      [link.fromId, link.toId],
      [link.toId, link.fromId],
    ] as const) {
      const list = adjacency.get(a);
      if (!list) continue;
      const existing = list.find((row) => row.id === b);
      if (existing) existing.ticks = Math.min(existing.ticks, link.travelTicks);
      else list.push({ id: b, ticks: link.travelTicks });
    }
  }
  for (const list of adjacency.values()) list.sort((a, b) => a.id - b.id);
  return adjacency;
}

/** Undirected link pairs, lower id first, sorted. */
function linkPairs(adjacency: Adjacency): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (const [id, list] of adjacency) {
    for (const row of list) if (id < row.id) pairs.push([id, row.id]);
  }
  pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return pairs;
}

function regionRadius(capacity: number): number {
  return clamp(24 + capacity * 0.36, 24, 52);
}

function layoutRegions(input: WorldInput, adjacency: Adjacency): Region[] {
  const { seed } = input;
  const sorted = [...input.territories].sort((a, b) => a.id - b.id);
  const position = new Map<number, Vec2>();
  const radius = new Map(sorted.map((t) => [t.id, regionRadius(t.capacity)]));
  const order: number[] = [];
  let componentOffset = 0;

  for (const root of sorted) {
    if (position.has(root.id)) continue;
    position.set(root.id, { x: componentOffset, z: 0 });
    order.push(root.id);
    // Chains run from the near left toward the far right so the high ground
    // ends up at the back of the default view.
    const rootHeading = -0.42 + (hash01(seed, root.id, 11) - 0.5) * 0.3;
    const queue: Array<{ id: number; heading: number; isRoot: boolean }> = [
      { id: root.id, heading: rootHeading, isRoot: true },
    ];
    while (queue.length > 0) {
      const node = queue.shift()!;
      const from = position.get(node.id)!;
      const children = (adjacency.get(node.id) ?? []).filter(
        (row) => !position.has(row.id),
      );
      children.forEach((child, index) => {
        const fan = node.isRoot ? (Math.PI * 2) / children.length : 1.15;
        const spread = (index - (children.length - 1) / 2) * fan;
        const bend = node.isRoot
          ? 0
          : -0.42 + (hash01(seed, node.id, child.id) - 0.5) * 0.5;
        const heading = node.heading + spread + bend;
        const dist =
          radius.get(node.id)! + radius.get(child.id)! + 18 + child.ticks * 2.5;
        position.set(child.id, {
          x: from.x + Math.cos(heading) * dist,
          z: from.z + Math.sin(heading) * dist,
        });
        order.push(child.id);
        queue.push({ id: child.id, heading, isRoot: false });
      });
    }
    let maxX = -Infinity;
    for (const [id, p] of position) {
      maxX = Math.max(maxX, p.x + radius.get(id)!);
    }
    componentOffset = maxX + 90;
  }

  // Keep unrelated regions from overlapping.
  for (let pass = 0; pass < 40; pass += 1) {
    for (let i = 0; i < order.length; i += 1) {
      for (let j = i + 1; j < order.length; j += 1) {
        const a = position.get(order[i]!)!;
        const b = position.get(order[j]!)!;
        const want = radius.get(order[i]!)! + radius.get(order[j]!)! + 14;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const dist = Math.hypot(dx, dz);
        if (dist >= want) continue;
        const push = (want - dist) / 2;
        const dir = normalize(dx, dz, { x: 1, z: 0 });
        a.x -= dir.x * push;
        a.z -= dir.z * push;
        b.x += dir.x * push;
        b.z += dir.z * push;
      }
    }
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of position.values()) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;

  const regions: Region[] = sorted.map((t, index) => {
    const p = position.get(t.id)!;
    return {
      index,
      territoryId: t.id,
      slug: t.slug,
      name: t.name,
      biome: biomeForTerritory(t),
      center: { x: p.x - cx, z: p.z - cz },
      radius: radius.get(t.id)!,
      elevation: 0,
      waterSide: { x: 0, z: 1 },
      peak: null,
    };
  });

  // Strictly ordered elevations, so every linked pair has a downhill side.
  const byHeight = [...regions].sort(
    (a, b) =>
      a.biome.elevation - b.biome.elevation || a.territoryId - b.territoryId,
  );
  let previous = -Infinity;
  for (const region of byHeight) {
    region.elevation = Math.max(region.biome.elevation, previous + 0.9);
    previous = region.elevation;
  }

  const byId = new Map(regions.map((r) => [r.territoryId, r]));
  let centroidX = 0;
  let centroidZ = 0;
  for (const r of regions) {
    centroidX += r.center.x / regions.length;
    centroidZ += r.center.z / regions.length;
  }

  for (const region of regions) {
    // Principal axis of the links through this region (sign-free), so water
    // sits beside the line of travel even when two neighbours lie on the same
    // side. For one link, or two roughly opposite ones, this is the same axis
    // as the signed in/out sum it replaces.
    let sxx = 0;
    let szz = 0;
    let sxz = 0;
    for (const row of adjacency.get(region.territoryId) ?? []) {
      const other = byId.get(row.id)!;
      const d = normalize(
        other.center.x - region.center.x,
        other.center.z - region.center.z,
        { x: 1, z: 0 },
      );
      sxx += d.x * d.x;
      szz += d.z * d.z;
      sxz += d.x * d.z;
    }
    const theta = 0.5 * Math.atan2(2 * sxz, sxx - szz);
    const along =
      sxx + szz > 0
        ? { x: Math.cos(theta), z: Math.sin(theta) }
        : { x: 1, z: 0 };
    // Water sits beside the line of travel, on the side nearer the viewer.
    let side = { x: -along.z, z: along.x };
    if (side.z < 0) side = { x: -side.x, z: -side.z };
    region.waterSide = side;

    if (region.biome.peak) {
      const away = normalize(
        region.center.x - centroidX,
        region.center.z - centroidZ,
        { x: 0.7, z: -0.7 },
      );
      region.peak = {
        x: region.center.x + away.x * region.radius * 1.3,
        z: region.center.z + away.z * region.radius * 1.3,
      };
    }
  }
  return regions;
}

function makeBodies(seed: number, regions: Region[]): WaterBody[] {
  return regions.map((region, id) => {
    const kind = region.biome.water;
    const scale = kind === "pond" ? 0.33 : kind === "swamp" ? 0.43 : 0.22;
    const radius = region.radius * scale;
    const center = {
      x: region.center.x + region.waterSide.x * region.radius * 0.5,
      z: region.center.z + region.waterSide.z * region.radius * 0.5,
    };
    const lobes: Lobe[] = [];
    const key = region.territoryId;
    if (kind === "swamp") {
      // Many small pools that half-merge: channels, hummocks and islets.
      const count = 9;
      for (let i = 0; i < count; i += 1) {
        const angle =
          (i / count) * Math.PI * 2 + hash01(seed, key, 40 + i) * 0.9;
        const dist = radius * (0.25 + hash01(seed, key, 60 + i) * 0.62);
        lobes.push({
          x: center.x + Math.cos(angle) * dist,
          z: center.z + Math.sin(angle) * dist,
          r: radius * (0.2 + hash01(seed, key, 80 + i) * 0.16),
        });
      }
      lobes.push({ x: center.x, z: center.z, r: radius * 0.3 });
    } else {
      lobes.push({ x: center.x, z: center.z, r: radius * 0.72 });
      const extra = kind === "pond" ? 3 : 2;
      for (let i = 0; i < extra; i += 1) {
        const angle =
          (i / extra) * Math.PI * 2 + hash01(seed, key, 20 + i) * 1.4;
        const dist = radius * 0.55;
        lobes.push({
          x: center.x + Math.cos(angle) * dist,
          z: center.z + Math.sin(angle) * dist,
          r: radius * (0.36 + hash01(seed, key, 30 + i) * 0.18),
        });
      }
    }
    return {
      id,
      regionIndex: region.index,
      kind,
      center,
      radius,
      level: region.elevation - (kind === "swamp" ? 0.7 : 0.95),
      lobes,
    };
  });
}

function movingAverage(values: number[], radius: number): number[] {
  return values.map((_, i) => {
    let sum = 0;
    let count = 0;
    for (let j = i - radius; j <= i + radius; j += 1) {
      sum += values[clamp(j, 0, values.length - 1)]!;
      count += 1;
    }
    return sum / count;
  });
}

type RawPath = { x: number; z: number }[];

function meanderPath(
  seed: number,
  key: number,
  from: Vec2,
  to: Vec2,
  amplitude: number,
): RawPath {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  const dir = normalize(dx, dz, { x: 1, z: 0 });
  const perp = { x: -dir.z, z: dir.x };
  const steps = Math.max(8, Math.ceil(length / 1.5));
  const cycles = Math.max(1, length / 44);
  const phase = hash01(seed, key, 3) * Math.PI * 2;
  const points: RawPath = [];
  for (let i = 0; i <= steps; i += 1) {
    const s = i / steps;
    const taper = Math.pow(Math.sin(Math.PI * s), 0.6);
    const swing =
      Math.sin(s * cycles * Math.PI * 2 + phase) * amplitude +
      fbm(seed + key * 17, s * cycles * 3.1, 0.5, 3) * amplitude * 0.9;
    points.push({
      x: from.x + dx * s + perp.x * swing * taper,
      z: from.z + dz * s + perp.z * swing * taper,
    });
  }
  return points;
}

function segmentIntersection(
  a: Vec2,
  b: Vec2,
  c: Vec2,
  d: Vec2,
): { x: number; z: number; t: number } | null {
  const rX = b.x - a.x;
  const rZ = b.z - a.z;
  const sX = d.x - c.x;
  const sZ = d.z - c.z;
  const denom = rX * sZ - rZ * sX;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((c.x - a.x) * sZ - (c.z - a.z) * sX) / denom;
  const u = ((c.x - a.x) * rZ - (c.z - a.z) * rX) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a.x + rX * t, z: a.z + rZ * t, t: u };
}

export function planWorld(input: WorldInput): WorldPlan {
  const seed = input.seed | 0;
  const adjacency = buildAdjacency(input);
  const regions = layoutRegions(input, adjacency);
  const regionById = new Map(regions.map((r) => [r.territoryId, r]));
  const pairs = linkPairs(adjacency);

  const corridors = pairs.map(([a, b]) => ({
    a: regionById.get(a)!.center,
    b: regionById.get(b)!.center,
  }));

  // Open country beside every link and behind every region, so the map is a
  // broad landmass rather than a strip joining the territories.
  const wilds: WildLobe[] = [];
  pairs.forEach(([a, b], index) => {
    const ra = regionById.get(a)!;
    const rb = regionById.get(b)!;
    const dir = normalize(
      rb.center.x - ra.center.x,
      rb.center.z - ra.center.z,
      { x: 1, z: 0 },
    );
    const midX = (ra.center.x + rb.center.x) / 2;
    const midZ = (ra.center.z + rb.center.z) / 2;
    for (const side of [-1, 1]) {
      const reach = 58 + hash01(seed, 700 + index, side + 2) * 26;
      wilds.push({
        x: midX - dir.z * reach * side,
        z: midZ + dir.x * reach * side,
        r: 40 + hash01(seed, 710 + index, side + 2) * 16,
        hill: hash01(seed, 720 + index, side + 2) * 9,
      });
    }
  });
  {
    let cx = 0;
    let cz = 0;
    for (const r of regions) {
      cx += r.center.x / regions.length;
      cz += r.center.z / regions.length;
    }
    for (const r of regions) {
      if (r.peak) continue;
      const away = normalize(r.center.x - cx, r.center.z - cz, {
        x: -0.7,
        z: 0.7,
      });
      wilds.push({
        x: r.center.x + away.x * (r.radius + 34),
        z: r.center.z + away.z * (r.radius + 34),
        r: 36,
        hill: hash01(seed, 730, r.territoryId) * 6,
      });
    }
  }

  /** Distance inside the coastline; negative out at sea. */
  function landInside(x: number, z: number): number {
    let sdf = Infinity;
    for (const r of regions) {
      const d =
        Math.hypot(x - r.center.x, z - r.center.z) - (r.radius + LAND_MARGIN);
      sdf = sdf === Infinity ? d : smin(sdf, d, 26);
      if (r.peak) {
        const dp = Math.hypot(x - r.peak.x, z - r.peak.z) - r.radius * 1.15;
        sdf = smin(sdf, dp, 26);
      }
    }
    for (const c of corridors) {
      const d = distToSegment(x, z, c.a.x, c.a.z, c.b.x, c.b.z) - 40;
      sdf = smin(sdf, d, 26);
    }
    for (const w of wilds) {
      sdf = smin(sdf, Math.hypot(x - w.x, z - w.z) - w.r, 30);
    }
    return -sdf + fbm(seed + 301, x / 40, z / 40, 3) * 16;
  }

  function regionWeights(x: number, z: number, out: Float32Array): number {
    const warp = fbm(seed + 91, x / 30, z / 30, 2);
    let total = 0;
    for (let i = 0; i < regions.length; i += 1) {
      const r = regions[i]!;
      const d =
        Math.hypot(x - r.center.x, z - r.center.z) / r.radius + warp * 0.24;
      const w = smoothstep(1.32, 0.72, d);
      out[i] = w;
      total += w;
    }
    if (total > 1) {
      for (let i = 0; i < regions.length; i += 1) out[i] = out[i]! / total;
      return 0;
    }
    return 1 - total;
  }

  const weightScratch = new Float32Array(Math.max(1, regions.length));

  function baseHeight(x: number, z: number): number {
    let wsum = 0.05;
    let esum = 0.05 * WILD.elevation;
    for (const r of regions) {
      const d = Math.hypot(x - r.center.x, z - r.center.z) / (r.radius * 1.08);
      const g = Math.exp(-d * d);
      wsum += g;
      esum += g * r.elevation;
    }
    const wild = regionWeights(x, z, weightScratch);
    let relief = wild * WILD.relief;
    let crag = wild * WILD.crag;
    for (let i = 0; i < regions.length; i += 1) {
      relief += weightScratch[i]! * regions[i]!.biome.relief;
      crag += weightScratch[i]! * regions[i]!.biome.crag;
    }
    let h = esum / wsum;
    h += fbm(seed, x / 48, z / 48, 4) * relief * 1.7;
    h += (ridged(seed + 7, x / 26, z / 26, 4) - 0.45) * crag * 1.6;
    h += fbm(seed + 13, x / 9, z / 9, 2) * (0.22 + crag * 0.12);
    for (const w of wilds) {
      const dw = Math.hypot(x - w.x, z - w.z) / (w.r * 0.7);
      h += w.hill * Math.exp(-dw * dw);
    }
    for (const r of regions) {
      if (!r.peak) continue;
      const dp = Math.hypot(x - r.peak.x, z - r.peak.z) / (r.radius * 0.82);
      const crest = 0.62 + 0.55 * ridged(seed + 23, x / 24, z / 24, 4);
      h += 30 * Math.exp(-dp * dp) * crest;
    }
    const coast = smoothstep(0, 34, landInside(x, z));
    return mix(-6, h, coast);
  }

  const bodies = makeBodies(seed, regions);
  // Still water settles below the lowest ground around it, so it sits in a
  // hollow instead of standing proud of a slope.
  for (const body of bodies) {
    let lowest = Infinity;
    const ring = body.radius * 1.25 + 6;
    for (let i = 0; i < 32; i += 1) {
      const angle = (i / 32) * Math.PI * 2;
      lowest = Math.min(
        lowest,
        baseHeight(
          body.center.x + Math.cos(angle) * ring,
          body.center.z + Math.sin(angle) * ring,
        ),
      );
    }
    const region = regions[body.regionIndex]!;
    body.level = Math.max(
      Math.min(body.level, lowest - 0.3),
      region.elevation - 2.8,
    );
  }

  function bodySdf(body: WaterBody, x: number, z: number): number {
    let sdf = Infinity;
    const k = body.kind === "swamp" ? 2.2 : 3.2;
    for (const lobe of body.lobes) {
      const d = Math.hypot(x - lobe.x, z - lobe.z) - lobe.r;
      sdf = sdf === Infinity ? d : smin(sdf, d, k);
    }
    const wobble = body.kind === "swamp" ? 1.5 : 1.9;
    return (
      sdf + (valueNoise(seed + 57 + body.id, x * 0.16, z * 0.16) - 0.5) * wobble
    );
  }

  const rivers: River[] = [];

  function addRiver(
    key: number,
    path: RawPath,
    fromBody: WaterBody | null,
    toBody: WaterBody | null,
    startLevel: number,
    endLevel: number,
    baseHalfWidth: number,
  ): void {
    // Trim to the stretch between the two shorelines, with a short overlap so
    // the channel visibly joins each body.
    let first = 0;
    let last = path.length - 1;
    if (fromBody) {
      for (let i = 0; i < path.length; i += 1) {
        if (bodySdf(fromBody, path[i]!.x, path[i]!.z) < -1.2) first = i;
        else if (bodySdf(fromBody, path[i]!.x, path[i]!.z) > 0) break;
      }
    }
    if (toBody) {
      for (let i = first + 1; i < path.length; i += 1) {
        if (bodySdf(toBody, path[i]!.x, path[i]!.z) < -1.2) {
          last = i;
          break;
        }
      }
    }
    const trimmed = path.slice(first, last + 1);
    if (trimmed.length < 4) return;

    const along: number[] = [0];
    for (let i = 1; i < trimmed.length; i += 1) {
      along.push(
        along[i - 1]! +
          Math.hypot(
            trimmed[i]!.x - trimmed[i - 1]!.x,
            trimmed[i]!.z - trimmed[i - 1]!.z,
          ),
      );
    }
    const total = along[along.length - 1]!;

    // Water follows the land down and never climbs: each step takes the lower
    // of "a little below the last step" and "a little below the ground here".
    let levels: number[] = [];
    let natural = startLevel;
    let leavesAt = 0;
    for (let i = 0; i < trimmed.length; i += 1) {
      const p = trimmed[i]!;
      const insideFrom = fromBody ? bodySdf(fromBody, p.x, p.z) < 0 : false;
      if (insideFrom) leavesAt = i + 1;
      if (!insideFrom) {
        // The channel takes the lowest line across its own width, so neither
        // bank ends up below the water.
        const before = trimmed[Math.max(0, i - 1)]!;
        const after = trimmed[Math.min(trimmed.length - 1, i + 1)]!;
        const tangent = normalize(after.x - before.x, after.z - before.z, {
          x: 1,
          z: 0,
        });
        let ground = baseHeight(p.x, p.z);
        for (const offset of [baseHalfWidth + 2.5, baseHalfWidth + 6]) {
          for (const side of [-1, 1]) {
            ground = Math.min(
              ground,
              baseHeight(
                p.x - tangent.z * offset * side,
                p.z + tangent.x * offset * side,
              ),
            );
          }
        }
        natural = Math.max(endLevel, Math.min(natural - 0.004, ground - 0.75));
      }
      // The last stretch comes down to meet the water it feeds.
      const approach = smoothstep(16, 2, total - along[i]!);
      levels.push(mix(natural, endLevel, approach));
    }
    levels = movingAverage(movingAverage(levels, 3), 3);
    for (let i = 1; i < levels.length; i += 1) {
      levels[i] = Math.min(levels[i]!, levels[i - 1]!);
    }
    // Still level with the body until the channel has left its shore.
    for (let i = 0; i < Math.min(leavesAt, levels.length); i += 1) {
      levels[i] = startLevel;
    }
    levels[levels.length - 1] = endLevel;
    for (let i = levels.length - 2; i >= 0; i -= 1) {
      if (levels[i]! < endLevel) levels[i] = endLevel;
    }

    const points: RiverPoint[] = trimmed.map((p, i) => {
      const before = levels[Math.max(0, i - 2)]!;
      const after = levels[Math.min(levels.length - 1, i + 2)]!;
      const run =
        along[Math.min(along.length - 1, i + 2)]! - along[Math.max(0, i - 2)]!;
      const slope = run > 0 ? (before - after) / run : 0;
      const widthNoise =
        0.85 + valueNoise(seed + key * 29, along[i]! / 14, 0.5) * 0.35;
      return {
        x: p.x,
        z: p.z,
        level: levels[i]!,
        // Steep water runs narrow and fast; flat water spreads.
        halfWidth:
          baseHalfWidth *
          widthNoise *
          mix(1, 0.72, smoothstep(0.05, 0.3, slope)),
        along: along[i]!,
        speed: clamp(1.1 + slope * 16, 1.1, 5.5),
        rapids: smoothstep(0.04, 0.24, slope),
      };
    });
    rivers.push({
      id: rivers.length,
      fromBody: fromBody ? fromBody.id : null,
      toBody: toBody ? toBody.id : null,
      points,
    });
  }

  const elevationRank = new Map(
    [...regions]
      .sort((a, b) => b.elevation - a.elevation)
      .map((r, rank) => [r.index, rank] as const),
  );

  // Springs: a stream comes off the high ground into each ridge tarn.
  for (const region of regions) {
    if (!region.peak) continue;
    const body = bodies[region.index]!;
    const toPeak = normalize(
      region.peak.x - region.center.x,
      region.peak.z - region.center.z,
      { x: 0, z: -1 },
    );
    const source = {
      x: region.center.x + toPeak.x * region.radius * 1.02,
      z: region.center.z + toPeak.z * region.radius * 1.02,
    };
    const sourceLevel = baseHeight(source.x, source.z) - 0.6;
    if (sourceLevel < body.level + 2) continue;
    addRiver(
      1000 + region.territoryId,
      meanderPath(seed, 1000 + region.territoryId, source, body.center, 3.2),
      null,
      body,
      sourceLevel,
      body.level,
      1.7,
    );
  }

  // One river per linked pair, from the higher region's water to the lower's.
  for (const [a, b] of pairs) {
    const ra = regionById.get(a)!;
    const rb = regionById.get(b)!;
    const high = ra.elevation >= rb.elevation ? ra : rb;
    const low = high === ra ? rb : ra;
    const from = bodies[high.index]!;
    const to = bodies[low.index]!;
    const key = a * 97 + b;
    addRiver(
      key,
      meanderPath(seed, key, from.center, to.center, 7.5),
      from,
      to,
      from.level,
      to.level,
      2.3 + 0.7 * Math.min(2, elevationRank.get(high.index) ?? 0),
    );
  }

  // The lowest water in each connected group drains to the sea.
  let centroidX = 0;
  let centroidZ = 0;
  for (const r of regions) {
    centroidX += r.center.x / regions.length;
    centroidZ += r.center.z / regions.length;
  }
  const seen = new Set<number>();
  for (const start of regions) {
    if (seen.has(start.territoryId)) continue;
    const component: Region[] = [];
    const stack = [start.territoryId];
    seen.add(start.territoryId);
    while (stack.length > 0) {
      const id = stack.pop()!;
      component.push(regionById.get(id)!);
      for (const row of adjacency.get(id) ?? []) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        stack.push(row.id);
      }
    }
    const lowest = component.reduce((a, b) =>
      a.elevation <= b.elevation ? a : b,
    );
    const body = bodies[lowest.index]!;
    const dir = normalize(
      body.center.x - centroidX + lowest.waterSide.x * 30,
      body.center.z - centroidZ + lowest.waterSide.z * 30,
      { x: -0.7, z: 0.7 },
    );
    let reach = 20;
    while (reach < 260) {
      const x = body.center.x + dir.x * reach;
      const z = body.center.z + dir.z * reach;
      if (baseHeight(x, z) < -2.5) break;
      reach += 4;
    }
    const mouth = {
      x: body.center.x + dir.x * reach,
      z: body.center.z + dir.z * reach,
    };
    const key = 5000 + lowest.territoryId;
    addRiver(
      key,
      meanderPath(seed, key, body.center, mouth, 6),
      body,
      null,
      body.level,
      SEA_LEVEL,
      3.9,
    );
  }

  // Trails follow the links between region hearts, bowed away from the water.
  const trails: Trail[] = pairs.map(([a, b]) => {
    const ra = regionById.get(a)!;
    const rb = regionById.get(b)!;
    const dx = rb.center.x - ra.center.x;
    const dz = rb.center.z - ra.center.z;
    const length = Math.hypot(dx, dz);
    const dir = normalize(dx, dz, { x: 1, z: 0 });
    let perp = { x: -dir.z, z: dir.x };
    const waterX = ra.waterSide.x + rb.waterSide.x;
    const waterZ = ra.waterSide.z + rb.waterSide.z;
    if (perp.x * waterX + perp.z * waterZ > 0) {
      perp = { x: -perp.x, z: -perp.z };
    }
    const steps = Math.max(6, Math.ceil(length / 2));
    const points: Vec2[] = [];
    for (let i = 0; i <= steps; i += 1) {
      const s = i / steps;
      const bow =
        Math.sin(Math.PI * s) * 7 +
        fbm(seed + a * 31 + b, s * 4, 1.5, 2) * 4 * Math.sin(Math.PI * s);
      points.push({
        x: ra.center.x + dx * s + perp.x * bow,
        z: ra.center.z + dz * s + perp.z * bow,
      });
    }
    return { fromId: a, toId: b, points };
  });

  const fords: Ford[] = [];
  for (const trail of trails) {
    for (let i = 1; i < trail.points.length; i += 1) {
      const a = trail.points[i - 1]!;
      const b = trail.points[i]!;
      for (const river of rivers) {
        for (let j = 1; j < river.points.length; j += 1) {
          const c = river.points[j - 1]!;
          const d = river.points[j]!;
          const hit = segmentIntersection(a, b, c, d);
          if (!hit) continue;
          fords.push({
            x: hit.x,
            z: hit.z,
            level: mix(c.level, d.level, hit.t),
            dir: normalize(b.x - a.x, b.z - a.z, { x: 1, z: 0 }),
          });
        }
      }
    }
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const grow = (x: number, z: number, pad: number) => {
    minX = Math.min(minX, x - pad);
    maxX = Math.max(maxX, x + pad);
    minZ = Math.min(minZ, z - pad);
    maxZ = Math.max(maxZ, z + pad);
  };
  for (const r of regions) {
    grow(r.center.x, r.center.z, r.radius + WORLD_MARGIN);
    if (r.peak) grow(r.peak.x, r.peak.z, r.radius * 1.15 + WORLD_MARGIN);
  }
  for (const river of rivers) {
    for (const p of river.points) grow(p.x, p.z, 24);
  }
  if (regions.length === 0) grow(0, 0, 120);

  for (const w of wilds) grow(w.x, w.z, w.r + 44);

  return {
    seed,
    regions,
    wilds,
    bodies,
    rivers,
    trails,
    fords,
    bounds: { minX, maxX, minZ, maxZ },
    baseHeight,
    bodySdf,
    regionWeights,
  };
}

export { BIOMES };

/**
 * Deterministic world anchors for creature motion. Same (seed, id, territory)
 * always yields the same food patches, drink shore, nest, etc.
 *
 * Free-roam (visual pass 3): explore / wander / forage waypoints may land in
 * any presentation region or along trails and shores — not locked to a home
 * territory disc. Nest / home stay nearer the home region for rest poses.
 */
import { hash01 } from "../world/noise";
import type { WorldModel } from "../world/world-model";
import type { Region } from "../world/world-plan";

export type Anchor = { x: number; z: number; y: number };

function dryLand(model: WorldModel, x: number, z: number): Anchor {
  let px = x;
  let pz = z;
  for (let i = 0; i < 8; i += 1) {
    const wd = model.waterDistAt(px, pz);
    if (wd >= 0.85) break;
    // Step toward higher ground / away from water by sampling a ring.
    let bestX = px;
    let bestZ = pz;
    let best = wd;
    for (let k = 0; k < 8; k += 1) {
      const a = (k / 8) * Math.PI * 2;
      const sx = px + Math.cos(a) * 1.1;
      const sz = pz + Math.sin(a) * 1.1;
      const score = model.waterDistAt(sx, sz);
      if (score > best) {
        best = score;
        bestX = sx;
        bestZ = sz;
      }
    }
    if (bestX === px && bestZ === pz) break;
    px = bestX;
    pz = bestZ;
  }
  // Keep on the island: if below sea-ish height, nudge toward origin.
  if (model.heightAt(px, pz) < 0.35) {
    px *= 0.92;
    pz *= 0.92;
  }
  return { x: px, z: pz, y: model.heightAt(px, pz) };
}

function dryPoint(
  model: WorldModel,
  x: number,
  z: number,
  region: Region,
): Anchor {
  let px = x;
  let pz = z;
  for (let i = 0; i < 6; i += 1) {
    const wd = model.waterDistAt(px, pz);
    if (wd >= 0.7) break;
    const awayX =
      px - (region.center.x + region.waterSide.x * region.radius * 0.4);
    const awayZ =
      pz - (region.center.z + region.waterSide.z * region.radius * 0.4);
    const len = Math.hypot(awayX, awayZ) || 1;
    const push = 0.9 - wd;
    px += (awayX / len) * push;
    pz += (awayZ / len) * push;
  }
  return dryLand(model, px, pz);
}

function sampleInRegion(
  model: WorldModel,
  region: Region,
  seed: number,
  creatureId: number,
  salt: number,
  radiusScale: number,
): Anchor {
  const angle = hash01(seed, creatureId, salt) * Math.PI * 2;
  const radius =
    region.radius *
    radiusScale *
    (0.25 + hash01(seed, creatureId, salt + 1) * 0.7);
  const side = {
    x: -region.waterSide.x,
    z: -region.waterSide.z,
  };
  const x =
    region.center.x +
    Math.cos(angle) * radius * 0.55 +
    side.x * region.radius * 0.28;
  const z =
    region.center.z +
    Math.sin(angle) * radius * 0.55 +
    side.z * region.radius * 0.28;
  return dryPoint(model, x, z, region);
}

/** Pick a presentation region by salt — may differ from the creature's home. */
export function pickRegion(
  model: WorldModel,
  seed: number,
  creatureId: number,
  salt: number,
  prefer?: Region,
): Region {
  const regions = model.regions;
  if (regions.length === 0) {
    return prefer ?? ({ center: { x: 0, z: 0 }, radius: 20 } as Region);
  }
  // Bias: ~40% home when provided, otherwise uniform across all regions.
  if (prefer && hash01(seed, creatureId, salt) < 0.4) return prefer;
  const idx =
    Math.floor(hash01(seed, creatureId, salt + 3) * regions.length) %
    regions.length;
  return regions[idx]!;
}

/** Island-wide dry sample — crosses Meadow / Thicket / Ridge freely. */
export function sampleOpenWorld(
  model: WorldModel,
  seed: number,
  creatureId: number,
  salt: number,
): Anchor {
  const region = pickRegion(model, seed, creatureId, salt);
  // Stretch past the named region into the continuous wild fringe.
  const angle = hash01(seed, creatureId, salt + 7) * Math.PI * 2;
  const reach =
    region.radius * (0.55 + hash01(seed, creatureId, salt + 8) * 1.35);
  const x = region.center.x + Math.cos(angle) * reach;
  const z = region.center.z + Math.sin(angle) * reach;
  return dryLand(model, x, z);
}

/** Shoreline for any still-water body, preferring home then neighbors. */
export function drinkShore(
  model: WorldModel,
  region: Region,
  seed: number,
  creatureId: number,
): Anchor {
  const preferHome = hash01(seed, creatureId, 91) < 0.55;
  const body =
    (preferHome ? model.bodies[region.index] : null) ??
    model.bodies[
      Math.floor(hash01(seed, creatureId, 92) * model.bodies.length) %
        Math.max(1, model.bodies.length)
    ] ??
    model.bodies[region.index];
  if (!body) {
    return sampleInRegion(model, region, seed, creatureId, 90, 0.5);
  }
  const prefer = hash01(seed, creatureId, 93) * Math.PI * 2;
  let best: Anchor | null = null;
  let bestScore = Infinity;
  for (let i = 0; i < 28; i += 1) {
    const angle = prefer + (i / 28) * Math.PI * 2;
    const r = body.radius * (0.95 + hash01(seed, creatureId, 100 + i) * 0.22);
    const x = body.center.x + Math.cos(angle) * r;
    const z = body.center.z + Math.sin(angle) * r;
    const wd = model.waterDistAt(x, z);
    const score = Math.abs(wd - 0.55);
    if (score < bestScore) {
      bestScore = score;
      best = { x, z, y: Math.max(model.heightAt(x, z), body.level + 0.02) };
    }
  }
  return best ?? sampleInRegion(model, region, seed, creatureId, 90, 0.4);
}

export function foodPatch(
  model: WorldModel,
  region: Region,
  seed: number,
  creatureId: number,
  index: number,
): Anchor {
  // Alternate home patches with open-world forage spots so paths cross regions.
  if (index % 2 === 0) {
    return sampleInRegion(
      model,
      region,
      seed,
      creatureId,
      200 + index * 17,
      0.7,
    );
  }
  const other = pickRegion(model, seed, creatureId, 210 + index * 19, region);
  return sampleInRegion(model, other, seed, creatureId, 220 + index * 17, 0.75);
}

export function nestSpot(
  model: WorldModel,
  region: Region,
  seed: number,
  creatureId: number,
): Anchor {
  const side = { x: -region.waterSide.x, z: -region.waterSide.z };
  const x = region.center.x + side.x * region.radius * 0.45;
  const z = region.center.z + side.z * region.radius * 0.45;
  const jitter = sampleInRegion(model, region, seed, creatureId, 70, 0.22);
  return dryPoint(model, (x + jitter.x) * 0.5, (z + jitter.z) * 0.5, region);
}

export function socialRing(
  model: WorldModel,
  region: Region,
  seed: number,
  creatureId: number,
): Anchor {
  // Gather near trail midpoints when available so social loops span regions.
  if (model.trails.length > 0 && hash01(seed, creatureId, 41) > 0.35) {
    const trail =
      model.trails[
        Math.floor(hash01(seed, creatureId, 42) * model.trails.length) %
          model.trails.length
      ]!;
    const mid = trail.points[Math.floor(trail.points.length / 2)]!;
    const jitter = (hash01(seed, creatureId, 43) - 0.5) * 6;
    const jitterZ = (hash01(seed, creatureId, 44) - 0.5) * 6;
    return dryLand(model, mid.x + jitter, mid.z + jitterZ);
  }
  return sampleInRegion(model, region, seed, creatureId, 40, 0.55);
}

export function explorePoint(
  model: WorldModel,
  region: Region,
  seed: number,
  creatureId: number,
  index: number,
): Anchor {
  // Mostly open-world; occasionally hug a river bank for readable shore walks.
  if (hash01(seed, creatureId, 300 + index * 13) < 0.28) {
    return drinkShore(
      model,
      pickRegion(model, seed, creatureId, 310 + index, region),
      seed,
      creatureId,
    );
  }
  return sampleOpenWorld(model, seed, creatureId, 320 + index * 17);
}

/** Point along the trail between two territories. */
export function trailPoint(
  model: WorldModel,
  fromId: number,
  toId: number,
  t: number,
): Anchor | null {
  const trail =
    model.trails.find(
      (row) =>
        (row.fromId === fromId && row.toId === toId) ||
        (row.fromId === toId && row.toId === fromId),
    ) ?? null;
  if (!trail || trail.points.length < 2) return null;
  const forward = trail.fromId === fromId;
  const points = forward ? trail.points : [...trail.points].reverse();
  const clamped = Math.min(1, Math.max(0, t));
  const f = clamped * (points.length - 1);
  const i = Math.min(points.length - 2, Math.floor(f));
  const local = f - i;
  const a = points[i]!;
  const b = points[i + 1]!;
  const x = a.x + (b.x - a.x) * local;
  const z = a.z + (b.z - a.z) * local;
  return { x, z, y: model.heightAt(x, z) };
}

export function regionHome(
  model: WorldModel,
  region: Region,
  seed: number,
  creatureId: number,
): Anchor {
  return sampleInRegion(model, region, seed, creatureId, 11, 0.45);
}

/**
 * Build a smooth open-world path from `from` toward `to`.
 * Prefers an existing trail corridor when the endpoints sit in different
 * regions; otherwise inserts one dry midpoint so long hops do not pop.
 */
export function roamWaypoints(
  model: WorldModel,
  from: Anchor,
  to: Anchor,
): Anchor[] {
  const dist = Math.hypot(to.x - from.x, to.z - from.z);
  if (dist < 8) return [to];

  const fromRegion = model.regionAt(from.x, from.z);
  const toRegion = model.regionAt(to.x, to.z);
  if (
    fromRegion &&
    toRegion &&
    fromRegion.territoryId !== toRegion.territoryId
  ) {
    const along = trailPoint(
      model,
      fromRegion.territoryId,
      toRegion.territoryId,
      0.5,
    );
    if (along) {
      return [dryLand(model, along.x, along.z), to];
    }
  }

  // Water-edge aware midpoint: stay on the dryer side of the segment.
  const mx = (from.x + to.x) * 0.5;
  const mz = (from.z + to.z) * 0.5;
  const mid = dryLand(model, mx, mz);
  if (dist > 22) {
    const q1 = dryLand(
      model,
      from.x + (to.x - from.x) * 0.33,
      from.z + (to.z - from.z) * 0.33,
    );
    const q2 = dryLand(
      model,
      from.x + (to.x - from.x) * 0.66,
      from.z + (to.z - from.z) * 0.66,
    );
    return [q1, q2, to];
  }
  return [mid, to];
}

/** Seconds to walk a path at a readable presentation pace. */
export function roamDuration(
  path: Anchor[],
  from: Anchor,
  base: number,
): number {
  let len = 0;
  let prev = from;
  for (const p of path) {
    len += Math.hypot(p.x - prev.x, p.z - prev.z);
    prev = p;
  }
  // ~4.5 world units / second presentation speed, clamped.
  return Math.min(28, Math.max(base, len / 4.5));
}

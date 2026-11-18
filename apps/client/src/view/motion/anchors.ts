/**
 * Deterministic world anchors for creature motion. Same (seed, id, territory)
 * always yields the same food patches, drink shore, nest, etc.
 */
import { hash01 } from "../world/noise";
import type { WorldModel } from "../world/world-model";
import type { Region } from "../world/world-plan";

export type Anchor = { x: number; z: number; y: number };

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
  return { x: px, z: pz, y: model.heightAt(px, pz) };
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
  // Prefer the dry side of the region, opposite the water.
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

/** Nearest still-water shoreline in the creature's territory. */
export function drinkShore(
  model: WorldModel,
  region: Region,
  seed: number,
  creatureId: number,
): Anchor {
  const body = model.bodies[region.index];
  if (!body) {
    return sampleInRegion(model, region, seed, creatureId, 90, 0.5);
  }
  const prefer = hash01(seed, creatureId, 91) * Math.PI * 2;
  let best: Anchor | null = null;
  let bestScore = Infinity;
  for (let i = 0; i < 24; i += 1) {
    const angle = prefer + (i / 24) * Math.PI * 2;
    const r = body.radius * (0.95 + hash01(seed, creatureId, 100 + i) * 0.2);
    const x = body.center.x + Math.cos(angle) * r;
    const z = body.center.z + Math.sin(angle) * r;
    const wd = model.waterDistAt(x, z);
    // Want just outside the water.
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
  return sampleInRegion(
    model,
    region,
    seed,
    creatureId,
    200 + index * 17,
    0.62,
  );
}

export function nestSpot(
  model: WorldModel,
  region: Region,
  seed: number,
  creatureId: number,
): Anchor {
  // Sheltered: toward the dry hinterland, not the shore.
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
  return sampleInRegion(model, region, seed, creatureId, 40, 0.35);
}

export function explorePoint(
  model: WorldModel,
  region: Region,
  seed: number,
  creatureId: number,
  index: number,
): Anchor {
  return sampleInRegion(
    model,
    region,
    seed,
    creatureId,
    300 + index * 13,
    0.78,
  );
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
  return sampleInRegion(model, region, seed, creatureId, 11, 0.4);
}

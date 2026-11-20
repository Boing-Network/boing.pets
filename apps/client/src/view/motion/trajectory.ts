/**
 * Authoritative movement → screen motion. Pure and view-only.
 *
 * The sim gives every creature a movement leg: territory-local spots
 * `fromSpot` → `spot` (permille of the territory radius; see the contract's
 * `positions.ts`) over its action window [actionStartedTick, actionEndsTick].
 * This module resolves those spots onto the landscape, routes the leg around
 * water (or along the trail for a migration), and samples it at a fractional
 * sim tick. Every client that shares the host clock computes the same pose.
 */
import {
  Action,
  ActionTargetKind,
  SPOT_SCALE,
  isShoreSpot,
  type CreatureView,
  type WorldClock,
} from "@boing-pets/contract";
import type { WorldModel } from "../world/world-model";
import type { Region } from "../world/world-plan";
import { roamWaypoints, toDryLand, trailPath, type Anchor } from "./anchors";
import type { Locomotion } from "./behavior";

/** How much of a region's radius the land spots spread over. */
const LAND_SPREAD = 0.82;

/** Presentation walking speed (world units per real second) by gait. */
export function walkSpeed(locomotion: Locomotion): number {
  switch (locomotion) {
    case "trot":
      return 2.6;
    case "fly":
      return 3.2;
    case "hover":
      return 1.5;
    default:
      return 1.7;
  }
}

/** World units covered by one full gait cycle (two steps). */
export function strideLength(locomotion: Locomotion): number {
  switch (locomotion) {
    case "trot":
      return 1.15;
    case "fly":
      return 2.4;
    case "hover":
      return 1.6;
    default:
      return 0.85;
  }
}

/** Largest share of an action window spent walking before the action plays. */
function walkShare(action: CreatureView["currentAction"]): number {
  switch (action) {
    case Action.RELOCATE:
      return 1;
    case Action.WANDER:
      return 0.9;
    case Action.APPROACH:
    case Action.COURT:
    case Action.GUARD:
      return 0.7;
    case Action.DRINK:
    case Action.NURSE:
      return 0.5;
    case Action.REST:
      return 0.45;
    default:
      return 0.55;
  }
}

function regionFor(model: WorldModel, territoryId: number): Region | null {
  return model.regionByTerritoryId.get(territoryId) ?? model.regions[0] ?? null;
}

/** Walk outward along a ray until the ground is a dry bank beside water. */
function bankAlong(
  model: WorldModel,
  ox: number,
  oz: number,
  dx: number,
  dz: number,
  from: number,
  to: number,
): Anchor | null {
  let sawWater = false;
  for (let r = from; r <= to; r += 0.4) {
    const x = ox + dx * r;
    const z = oz + dz * r;
    const wd = model.waterDistAt(x, z);
    if (wd < 0.35) {
      sawWater = true;
      continue;
    }
    // Either leaving the water (pond case) or arriving at it (river case).
    if (sawWater || wd < 1.2) {
      const level = model.waterSurfaceAt(x, z);
      return {
        x,
        z,
        y: Math.max(model.heightAt(x, z), (level ?? -Infinity) + 0.02),
      };
    }
  }
  return null;
}

/**
 * Dry bank of the region's water along `angle`: its pond / tarn / swamp when
 * it has one, otherwise the nearest river bank out from the region center.
 */
function shorePoint(model: WorldModel, region: Region, angle: number): Anchor {
  const dx = Math.cos(angle);
  const dz = Math.sin(angle);
  const body = model.bodies.find((row) => row.regionIndex === region.index);
  if (body) {
    const bank = bankAlong(
      model,
      body.center.x,
      body.center.z,
      dx,
      dz,
      body.radius * 0.3,
      body.radius * 2.4,
    );
    if (bank) return bank;
  }
  // No still water: try the requested direction, then fan out around it.
  for (let k = 0; k < 16; k += 1) {
    const turn = (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8);
    const bank = bankAlong(
      model,
      region.center.x,
      region.center.z,
      Math.cos(angle + turn),
      Math.sin(angle + turn),
      0,
      region.radius * 1.8,
    );
    if (bank) return bank;
  }
  return toDryLand(
    model,
    region.center.x + dx * region.radius * LAND_SPREAD,
    region.center.z + dz * region.radius * LAND_SPREAD,
  );
}

/** Resolve a territory-local spot to a dry point on the landscape. */
export function spotToWorld(
  model: WorldModel,
  territoryId: number,
  spotX: number,
  spotZ: number,
): Anchor {
  const region = regionFor(model, territoryId);
  if (!region) return { x: 0, z: 0, y: model.heightAt(0, 0) };
  if (isShoreSpot(spotX, spotZ)) {
    return shorePoint(model, region, Math.atan2(spotZ, spotX));
  }
  const x =
    region.center.x + (spotX / SPOT_SCALE) * region.radius * LAND_SPREAD;
  const z =
    region.center.z + (spotZ / SPOT_SCALE) * region.radius * LAND_SPREAD;
  return toDryLand(model, x, z);
}

export type Leg = {
  /** Changes whenever the host starts a new leg (or the scale changes). */
  key: string;
  points: Anchor[];
  /** cumulative[i] = path length from points[0] to points[i]. */
  cumulative: number[];
  length: number;
  startTick: number;
  /** Fractional tick the creature arrives; the action plays after it. */
  arriveTick: number;
  travel: boolean;
};

export function legKey(creature: CreatureView, scale: number): string {
  return [
    creature.territoryId,
    creature.fromSpotX,
    creature.fromSpotZ,
    creature.spotX,
    creature.spotZ,
    creature.currentAction ?? "-",
    creature.actionTargetId ?? "-",
    creature.actionStartedTick ?? "-",
    creature.actionEndsTick ?? "-",
    scale,
  ].join(":");
}

function measure(points: Anchor[]): { cumulative: number[]; length: number } {
  const cumulative = [0];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    cumulative.push(cumulative[i - 1]! + Math.hypot(b.x - a.x, b.z - a.z));
  }
  return { cumulative, length: cumulative[cumulative.length - 1]! };
}

/**
 * Build the leg for the creature's current movement. `scale` and
 * `msPerTick` come from the shared host clock, so every client agrees on
 * when the walk ends.
 */
export function buildLeg(
  model: WorldModel,
  creature: CreatureView,
  locomotion: Locomotion,
  scale: number,
  msPerTick: number,
): Leg {
  const travel =
    creature.currentAction === Action.RELOCATE &&
    creature.actionTargetKind === ActionTargetKind.TERRITORY &&
    creature.actionTargetId != null;
  const start = spotToWorld(
    model,
    creature.territoryId,
    creature.fromSpotX,
    creature.fromSpotZ,
  );
  const end = spotToWorld(
    model,
    travel ? creature.actionTargetId! : creature.territoryId,
    creature.spotX,
    creature.spotZ,
  );

  let points: Anchor[];
  if (travel) {
    const trail = trailPath(
      model,
      creature.territoryId,
      creature.actionTargetId!,
    );
    points = trail
      ? [start, ...trail, end]
      : [start, ...roamWaypoints(model, start, end)];
  } else if (Math.hypot(end.x - start.x, end.z - start.z) < 0.05) {
    points = [start];
  } else {
    points = [start, ...roamWaypoints(model, start, end)];
  }
  const { cumulative, length } = measure(points);

  const startTick = creature.actionStartedTick ?? 0;
  const endTick = creature.actionEndsTick;
  let arriveTick = startTick;
  if (creature.currentAction != null && endTick != null && length > 0) {
    const window = Math.max(0, endTick - startTick);
    if (travel) {
      arriveTick = startTick + window;
    } else {
      const realSeconds = length / walkSpeed(locomotion);
      const natural =
        (realSeconds * 1000 * Math.max(1, scale)) / Math.max(1, msPerTick);
      arriveTick =
        startTick +
        Math.min(window * walkShare(creature.currentAction), natural);
    }
  }
  return {
    key: legKey(creature, scale),
    points,
    cumulative,
    length,
    startTick,
    arriveTick,
    travel,
  };
}

/** Gentle start and stop; never overshoots. */
export function easeWalk(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
}

export type LegSample = {
  x: number;
  z: number;
  y: number;
  /** Distance travelled along the leg (drives the gait phase). */
  distance: number;
  /** Facing (atan2(dx, dz)) of the current segment, or null when standing. */
  heading: number | null;
  moving: boolean;
  /** 0…1 progress of the walk. */
  progress: number;
};

export function sampleLeg(leg: Leg, simTick: number): LegSample {
  const last = leg.points[leg.points.length - 1]!;
  const span = leg.arriveTick - leg.startTick;
  if (leg.points.length === 1 || span <= 0 || simTick >= leg.arriveTick) {
    return {
      ...last,
      distance: leg.length,
      heading: null,
      moving: false,
      progress: 1,
    };
  }
  const progress = Math.max(0, (simTick - leg.startTick) / span);
  const distance = (leg.travel ? progress : easeWalk(progress)) * leg.length;
  let i = 1;
  while (i < leg.points.length - 1 && leg.cumulative[i]! < distance) i += 1;
  const a = leg.points[i - 1]!;
  const b = leg.points[i]!;
  const segment = leg.cumulative[i]! - leg.cumulative[i - 1]!;
  const local = segment > 0 ? (distance - leg.cumulative[i - 1]!) / segment : 1;
  const x = a.x + (b.x - a.x) * local;
  const z = a.z + (b.z - a.z) * local;
  const y = a.y + (b.y - a.y) * local;
  const heading = segment > 0.001 ? Math.atan2(b.x - a.x, b.z - a.z) : null;
  return { x, z, y, distance, heading, moving: progress < 1, progress };
}

/**
 * Fractional sim tick "now" from the last host clock. Ticks land every
 * `msPerTick / scale` wall ms; between them the fraction grows linearly.
 * Capped just under the next tick so a late message never runs ahead.
 */
export function estimateSimTick(
  clock: WorldClock | null,
  receivedAtMs: number,
  nowMs: number,
  fallbackTick: number,
): number {
  if (clock == null) return fallbackTick;
  if (clock.paused || !(clock.msPerTick > 0)) return clock.tick;
  const fraction = ((nowMs - receivedAtMs) * clock.scale) / clock.msPerTick;
  return clock.tick + Math.min(0.999, Math.max(0, fraction));
}

/** Gait phase 0…1 from distance walked: feet never slide. */
export function gaitPhase(distance: number, locomotion: Locomotion): number {
  const cycle = distance / strideLength(locomotion);
  return cycle - Math.floor(cycle);
}

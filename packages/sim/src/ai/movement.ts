/**
 * Authoritative creature positions (schema 2).
 *
 * The kernel works at territory granularity, so positions here are coarse and
 * territory-local: integers in permille of the territory's radius, with the
 * territory heart at (0, 0). The renderer maps them onto its landscape and
 * walks the creature from `fromSpot` to `spot` over the action window.
 *
 * - Land spots stay inside a disk of radius `LAND_SPOT_RADIUS`.
 * - A spot whose length exceeds `SHORE_SPOT_THRESHOLD` addresses the
 *   territory's waterline by angle (drinking). The renderer resolves it to
 *   the shore of that territory's water.
 *
 * Every choice is a pure function of (seed, tick, creature id, salt) via
 * `rngInt(..., "move", ...)`, so live play, catch-up, and every connected
 * client agree on where each creature is.
 */
import {
  Action,
  ActionTargetKind,
  LAND_SPOT_RADIUS,
  SHORE_SPOT_RADIUS,
  isShoreSpot,
} from "@boing-pets/contract";
import { rngInt } from "../rng";
import type { CreatureRow, WorldSnapshot } from "../types";

/** First world schema that stores creature positions. */
export const POSITIONS_SCHEMA_VERSION = 2;

const LAND_RADIUS = LAND_SPOT_RADIUS;
const SHORE_RADIUS = SHORE_SPOT_RADIUS;
/** Founders and arrivals settle within this radius of the heart. */
const SETTLE_RADIUS = 650;
/** One forage step: how far a grazer drifts from its last spot. */
const FORAGE_STEP = 320;
/** Companions stand this far from the creature they approach. */
const COMPANION_GAP = 90;

export type Spot = { x: number; z: number };

const MOVE_SALT_ANGLE = 1;
const MOVE_SALT_RADIUS = 2;
const MOVE_SALT_DX = 3;
const MOVE_SALT_DZ = 4;
const NEST_SALT = 11;

/** Integer cosine/sine table: 64 directions scaled by 1000 (literal, so
 * no floating-point trig runs inside the kernel). */
const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [1000, 0],
  [995, 98],
  [981, 195],
  [957, 290],
  [924, 383],
  [882, 471],
  [831, 556],
  [773, 634],
  [707, 707],
  [634, 773],
  [556, 831],
  [471, 882],
  [383, 924],
  [290, 957],
  [195, 981],
  [98, 995],
  [0, 1000],
  [-98, 995],
  [-195, 981],
  [-290, 957],
  [-383, 924],
  [-471, 882],
  [-556, 831],
  [-634, 773],
  [-707, 707],
  [-773, 634],
  [-831, 556],
  [-882, 471],
  [-924, 383],
  [-957, 290],
  [-981, 195],
  [-995, 98],
  [-1000, 0],
  [-995, -98],
  [-981, -195],
  [-957, -290],
  [-924, -383],
  [-882, -471],
  [-831, -556],
  [-773, -634],
  [-707, -707],
  [-634, -773],
  [-556, -831],
  [-471, -882],
  [-383, -924],
  [-290, -957],
  [-195, -981],
  [-98, -995],
  [0, -1000],
  [98, -995],
  [195, -981],
  [290, -957],
  [383, -924],
  [471, -882],
  [556, -831],
  [634, -773],
  [707, -707],
  [773, -634],
  [831, -556],
  [882, -471],
  [924, -383],
  [957, -290],
  [981, -195],
  [995, -98],
];

function direction(index: number): readonly [number, number] {
  const i = ((index % 64) + 64) % 64;
  return DIRECTIONS[i]!;
}

/** Pull a spot inside the land disk by repeated integer 3/4 scaling. */
export function clampToLand(x: number, z: number): Spot {
  let px = Math.trunc(x);
  let pz = Math.trunc(z);
  let guard = 0;
  while (px * px + pz * pz > LAND_RADIUS * LAND_RADIUS && guard < 64) {
    px = Math.trunc((px * 3) / 4);
    pz = Math.trunc((pz * 3) / 4);
    guard += 1;
  }
  return { x: px, z: pz };
}

/** Uniform-ish point in a disk: one of 64 directions times a radius roll. */
function diskSpot(
  seed: number,
  tick: number,
  subject: number,
  saltBase: number,
  radius: number,
): Spot {
  const [cx, cz] = direction(
    rngInt(seed, tick, "move", subject, saltBase + MOVE_SALT_ANGLE, 0, 63),
  );
  // sqrt-shaped radius without floats: max of two rolls biases outward.
  const r1 = rngInt(
    seed,
    tick,
    "move",
    subject,
    saltBase + MOVE_SALT_RADIUS,
    0,
    radius,
  );
  const r2 = rngInt(
    seed,
    tick,
    "move",
    subject,
    saltBase + MOVE_SALT_RADIUS + 20,
    0,
    radius,
  );
  const r = Math.max(r1, r2);
  return clampToLand(Math.trunc((cx * r) / 1000), Math.trunc((cz * r) / 1000));
}

/** Where a founder (or a legacy save without spots) stands at tick 0. */
export function settleSpot(
  seed: number,
  tick: number,
  creatureId: number,
): Spot {
  return diskSpot(seed, tick, creatureId, 100, SETTLE_RADIUS);
}

/** A creature's own resting place in a territory. Stable across visits. */
export function nestSpot(
  seed: number,
  creatureId: number,
  territoryId: number,
): Spot {
  return diskSpot(seed, territoryId, creatureId, 200 + NEST_SALT, 700);
}

function shoreSpot(seed: number, tick: number, creatureId: number): Spot {
  const [cx, cz] = direction(
    rngInt(seed, tick, "move", creatureId, 300, 0, 63),
  );
  return {
    x: Math.trunc((cx * SHORE_RADIUS) / 1000),
    z: Math.trunc((cz * SHORE_RADIUS) / 1000),
  };
}

function landFrom(x: number, z: number): Spot {
  return isShoreSpot(x, z) ? clampToLand(x, z) : { x, z };
}

function companionSpot(
  snapshot: WorldSnapshot,
  creature: CreatureRow,
  tick: number,
): Spot | null {
  if (creature.actionTargetKind !== ActionTargetKind.CREATURE) return null;
  const targetId = creature.actionTargetId;
  if (targetId == null) return null;
  const target = snapshot.creatures.find((row) => row.id === targetId);
  if (!target || target.territoryId !== creature.territoryId) return null;
  // A target already leaving for another territory is approached where it
  // stood, not where it is going.
  const relocating = target.currentAction === Action.RELOCATE;
  const base = landFrom(
    relocating ? target.fromSpotX : target.spotX,
    relocating ? target.fromSpotZ : target.spotZ,
  );
  const [cx, cz] = direction(
    rngInt(snapshot.world.seed, tick, "move", creature.id, 400, 0, 63),
  );
  return clampToLand(
    base.x + Math.trunc((cx * COMPANION_GAP) / 1000),
    base.z + Math.trunc((cz * COMPANION_GAP) / 1000),
  );
}

function motherSpot(
  snapshot: WorldSnapshot,
  creature: CreatureRow,
  tick: number,
): Spot | null {
  if (creature.motherId == null) return null;
  const mother = snapshot.creatures.find((row) => row.id === creature.motherId);
  if (!mother || mother.territoryId !== creature.territoryId) return null;
  if (mother.currentAction === Action.RELOCATE) return null;
  const base = landFrom(mother.spotX, mother.spotZ);
  const [cx, cz] = direction(
    rngInt(snapshot.world.seed, tick, "move", creature.id, 500, 0, 63),
  );
  return clampToLand(
    base.x + Math.trunc((cx * 60) / 1000),
    base.z + Math.trunc((cz * 60) / 1000),
  );
}

/**
 * Plan the movement leg for the action that was just started on `creature`.
 * The leg starts where the previous one ended and ends at a spot chosen for
 * the new action. Call after the action fields are set.
 */
export function planMove(
  snapshot: WorldSnapshot,
  creature: CreatureRow,
  tick: number,
): void {
  const seed = snapshot.world.seed;
  creature.fromSpotX = creature.spotX;
  creature.fromSpotZ = creature.spotZ;
  const here = landFrom(creature.spotX, creature.spotZ);
  let next: Spot;
  switch (creature.currentAction) {
    case Action.RELOCATE:
      // Arrival point inside the destination territory.
      next = diskSpot(seed, tick, creature.id, 600, SETTLE_RADIUS);
      break;
    case Action.DRINK:
      next = shoreSpot(seed, tick, creature.id);
      break;
    case Action.REST:
      next = nestSpot(seed, creature.id, creature.territoryId);
      break;
    case Action.NURSE:
      next = motherSpot(snapshot, creature, tick) ?? here;
      break;
    case Action.APPROACH:
    case Action.COURT:
    case Action.CONTEST:
    case Action.COOPERATE_FORAGE:
    case Action.GUARD:
      next =
        companionSpot(snapshot, creature, tick) ??
        diskSpot(seed, tick, creature.id, 700, LAND_RADIUS);
      break;
    case Action.WANDER:
      next = diskSpot(seed, tick, creature.id, 800, LAND_RADIUS);
      break;
    case Action.FORAGE:
    default: {
      const dx = rngInt(
        seed,
        tick,
        "move",
        creature.id,
        900 + MOVE_SALT_DX,
        -FORAGE_STEP,
        FORAGE_STEP,
      );
      const dz = rngInt(
        seed,
        tick,
        "move",
        creature.id,
        900 + MOVE_SALT_DZ,
        -FORAGE_STEP,
        FORAGE_STEP,
      );
      next = clampToLand(here.x + dx, here.z + dz);
      break;
    }
  }
  creature.spotX = next.x;
  creature.spotZ = next.z;
}

/** Founder / newborn helper: stand still at `spot`. */
export function placeAt(creature: CreatureRow, spot: Spot): void {
  creature.spotX = spot.x;
  creature.spotZ = spot.z;
  creature.fromSpotX = spot.x;
  creature.fromSpotZ = spot.z;
}

/**
 * Schema 1 → 2. Worlds saved before positions existed get a deterministic
 * settle spot per creature. A creature that is mid-action then gets that
 * action's leg (settle spot → action target) as if planned when it started,
 * so a DRINK in progress still ends at the shore. Pure function of the
 * snapshot, so a crash before the first commit re-derives the same result.
 * Returns true when the snapshot changed.
 */
export function upgradeSnapshotPositions(snapshot: WorldSnapshot): boolean {
  if (snapshot.world.schemaVersion >= POSITIONS_SCHEMA_VERSION) return false;
  const creatures = [...snapshot.creatures].sort((a, b) => a.id - b.id);
  for (const creature of creatures) {
    placeAt(
      creature,
      settleSpot(snapshot.world.seed, snapshot.world.lastTick, creature.id),
    );
  }
  for (const creature of creatures) {
    if (creature.currentAction == null) continue;
    planMove(
      snapshot,
      creature,
      creature.actionStartedTick ?? snapshot.world.lastTick,
    );
  }
  snapshot.world.schemaVersion = POSITIONS_SCHEMA_VERSION;
  return true;
}

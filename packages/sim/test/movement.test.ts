import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Action,
  LAND_SPOT_RADIUS,
  SHORE_SPOT_RADIUS,
  isShoreSpot,
} from "@boing-pets/contract";
import {
  POSITIONS_SCHEMA_VERSION,
  canonicalHash,
  createWorld,
  runSteps,
  settleSpot,
  step,
  upgradeSnapshotPositions,
  type CreatureRow,
  type WorldSnapshot,
} from "../src/index";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function len(x: number, z: number): number {
  return Math.sqrt(x * x + z * z);
}

/** Positions are integers, land spots stay inland, shore spots sit on the ring. */
function assertSpotInvariants(creature: CreatureRow, tick: number): void {
  const label = `creature ${creature.id} @${tick} ${creature.currentAction}`;
  for (const value of [
    creature.spotX,
    creature.spotZ,
    creature.fromSpotX,
    creature.fromSpotZ,
  ]) {
    assert.ok(Number.isSafeInteger(value), label);
  }
  const to = len(creature.spotX, creature.spotZ);
  const from = len(creature.fromSpotX, creature.fromSpotZ);
  assert.ok(from <= SHORE_SPOT_RADIUS + 1, `${label} from ${from}`);
  if (creature.currentAction === Action.DRINK) {
    assert.ok(isShoreSpot(creature.spotX, creature.spotZ), `${label} shore`);
    assert.ok(to <= SHORE_SPOT_RADIUS + 1, `${label} shore radius ${to}`);
  } else {
    assert.ok(to <= LAND_SPOT_RADIUS, `${label} land ${to}`);
  }
}

test("founders stand on distinct deterministic land spots", () => {
  const a = createWorld(1).snapshot;
  const b = createWorld(1).snapshot;
  assert.equal(a.world.schemaVersion, POSITIONS_SCHEMA_VERSION);
  const seen = new Set<string>();
  for (const creature of a.creatures) {
    assertSpotInvariants(creature, 0);
    assert.equal(creature.fromSpotX, creature.spotX);
    assert.equal(creature.fromSpotZ, creature.spotZ);
    assert.deepEqual(
      { x: creature.spotX, z: creature.spotZ },
      settleSpot(a.world.seed, 0, creature.id),
    );
    seen.add(`${creature.territoryId}:${creature.spotX},${creature.spotZ}`);
  }
  assert.ok(seen.size >= a.creatures.length - 1, "founders overlap");
  assert.deepEqual(
    a.creatures.map((c) => [c.spotX, c.spotZ]),
    b.creatures.map((c) => [c.spotX, c.spotZ]),
  );
});

test("every movement leg respects land / shore invariants over 600 ticks", () => {
  const snapshot = createWorld(1).snapshot;
  let moved = 0;
  let drinks = 0;
  let relocations = 0;
  for (let tick = 1; tick <= 600; tick += 1) {
    step(snapshot);
    for (const creature of snapshot.creatures) {
      assertSpotInvariants(creature, tick);
      if (
        creature.spotX !== creature.fromSpotX ||
        creature.spotZ !== creature.fromSpotZ
      ) {
        moved += 1;
      }
      if (creature.currentAction === Action.DRINK) drinks += 1;
      if (creature.currentAction === Action.RELOCATE) relocations += 1;
    }
  }
  assert.ok(moved > 500, `creatures should walk (moved=${moved})`);
  assert.ok(drinks > 0, "some creature drinks at the shore");
  assert.ok(relocations > 0, "some creature travels between territories");
});

test("a new leg starts where the previous one ended", () => {
  const snapshot = createWorld(1).snapshot;
  const last = new Map<
    number,
    { x: number; z: number; started: number | null }
  >();
  for (const creature of snapshot.creatures) {
    last.set(creature.id, {
      x: creature.spotX,
      z: creature.spotZ,
      started: creature.actionStartedTick,
    });
  }
  let legs = 0;
  for (let tick = 1; tick <= 300; tick += 1) {
    step(snapshot);
    for (const creature of snapshot.creatures) {
      const prev = last.get(creature.id);
      if (
        prev != null &&
        creature.actionStartedTick === snapshot.world.lastTick &&
        prev.started !== creature.actionStartedTick
      ) {
        assert.equal(creature.fromSpotX, prev.x, `leg x ${creature.id}`);
        assert.equal(creature.fromSpotZ, prev.z, `leg z ${creature.id}`);
        legs += 1;
      }
      last.set(creature.id, {
        x: creature.spotX,
        z: creature.spotZ,
        started: creature.actionStartedTick,
      });
    }
  }
  assert.ok(legs > 50, `legs=${legs}`);
});

test("positions are identical across runs and across catch-up batching", () => {
  const live = createWorld(7).snapshot;
  for (let i = 0; i < 240; i += 1) step(live);

  const batched = createWorld(7).snapshot;
  runSteps(batched, 100);
  runSteps(batched, 140);

  assert.equal(canonicalHash(live), canonicalHash(batched));
  assert.deepEqual(
    live.creatures.map((c) => [
      c.id,
      c.spotX,
      c.spotZ,
      c.fromSpotX,
      c.fromSpotZ,
    ]),
    batched.creatures.map((c) => [
      c.id,
      c.spotX,
      c.spotZ,
      c.fromSpotX,
      c.fromSpotZ,
    ]),
  );
});

test("schema 1 snapshots upgrade to deterministic settle spots once", () => {
  const snapshot = createWorld(1).snapshot;
  for (let i = 0; i < 50; i += 1) step(snapshot);
  const legacy: WorldSnapshot = clone(snapshot);
  legacy.world.schemaVersion = 1;
  for (const creature of legacy.creatures) {
    const row = creature as Partial<CreatureRow>;
    delete row.spotX;
    delete row.spotZ;
    delete row.fromSpotX;
    delete row.fromSpotZ;
  }
  const again = clone(legacy);

  assert.equal(upgradeSnapshotPositions(legacy), true);
  assert.equal(legacy.world.schemaVersion, POSITIONS_SCHEMA_VERSION);
  for (const creature of legacy.creatures) {
    assertSpotInvariants(creature, 50);
    // Every creature starts from its settle spot; idle ones stay there and
    // busy ones get the leg for the action they are in the middle of.
    assert.deepEqual(
      { x: creature.fromSpotX, z: creature.fromSpotZ },
      settleSpot(legacy.world.seed, legacy.world.lastTick, creature.id),
    );
    if (creature.currentAction == null) {
      assert.equal(creature.spotX, creature.fromSpotX);
      assert.equal(creature.spotZ, creature.fromSpotZ);
    }
  }
  assert.equal(upgradeSnapshotPositions(legacy), false, "idempotent");

  // A crash before the first commit re-runs the upgrade with the same result.
  upgradeSnapshotPositions(again);
  assert.equal(canonicalHash(again), canonicalHash(legacy));

  // The upgraded world keeps stepping with valid legs.
  for (let i = 0; i < 50; i += 1) {
    step(legacy);
    for (const creature of legacy.creatures) {
      assertSpotInvariants(creature, legacy.world.lastTick);
    }
  }
});

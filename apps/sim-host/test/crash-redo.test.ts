/**
 * M11 acceptance: kill the host after 5 ticks of a 10-tick batch.
 * Relaunch matches a clean run's canonical hash at that tick.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { CURRENT_SCHEMA_VERSION } from "@boing-pets/db";
import { canonicalHash, createWorld, step } from "@boing-pets/sim";
import {
  createDirtySet,
  markAfterTick,
  snapshotCursors,
} from "../src/persist/dirty";
import { loadSnapshot, SchemaTooNewError } from "../src/persist/load";
import { MemoryWorldRepository } from "../src/persist/memory-repository";
import { buildCommitBatch } from "../src/persist/save";
import {
  bootSession,
  commitSession,
  killSession,
  runBatch,
  stepSession,
} from "../src/session";

const SEED = 1;
const BATCH = 10;
const KILL_AFTER = 5;

test("crash after 5 of 10 ticks relaunches to the clean-run hash at that tick", async () => {
  // Clean run: commit worldgen, step 5, commit. That is the gold hash.
  const cleanStore = new MemoryWorldRepository();
  const clean = await bootSession(cleanStore, SEED);
  assert.equal(clean.snapshot.world.lastTick, 0);
  for (let i = 0; i < KILL_AFTER; i += 1) stepSession(clean);
  await commitSession(clean);
  assert.equal(clean.snapshot.world.lastTick, KILL_AFTER);
  const cleanHash = canonicalHash(clean.snapshot);

  // Crash path: same worldgen commit, start a 10-tick batch, die at 5.
  const crashStore = new MemoryWorldRepository();
  let crash = await bootSession(crashStore, SEED);
  assert.equal(crash.snapshot.world.lastTick, 0);
  await runBatch(crash, KILL_AFTER, BATCH);
  assert.equal(crash.snapshot.world.lastTick, KILL_AFTER);
  // No commit yet — the batch boundary is 10.
  killSession(crash);

  // Relaunch loads the last commit (tick 0), then redo 5 ticks and commit.
  crash = await bootSession(crashStore, SEED);
  assert.equal(crash.snapshot.world.lastTick, 0);
  for (let i = 0; i < KILL_AFTER; i += 1) stepSession(crash);
  await commitSession(crash);
  assert.equal(crash.snapshot.world.lastTick, KILL_AFTER);
  assert.equal(canonicalHash(crash.snapshot), cleanHash);
});

test("dirty save inserts use explicit kernel ids, not generated ones", async () => {
  const store = new MemoryWorldRepository();
  const session = await bootSession(store, SEED);
  const before = snapshotCursors(session.snapshot);
  stepSession(session);
  const batch = buildCommitBatch(session.snapshot, session.dirty);
  for (const creature of batch.insertCreatures) {
    assert.ok(Number.isSafeInteger(creature.id));
    assert.ok(creature.id >= 1);
  }
  for (const event of batch.insertEvents) {
    assert.ok(Number.isSafeInteger(event.id));
    assert.ok(event.id >= 1);
  }
  // Worldgen creatures are already stored; tick-1 dirty updates keep those ids.
  for (const creature of batch.updateCreatures) {
    assert.ok(creature.id < before.nextCreatureId);
  }
  await commitSession(session);
  const reloaded = await loadSnapshot(store);
  assert.ok(reloaded);
  assert.equal(reloaded.world.lastTick, 1);
  assert.equal(canonicalHash(reloaded), canonicalHash(session.snapshot));
});

test("load rebuilds discoveries from DISCOVERY events", async () => {
  const store = new MemoryWorldRepository();
  const session = await bootSession(store, SEED);
  const founderDiscoveries = session.snapshot.discoveries.length;
  // 35 species × 2 founders, one lineage (and one discovery) each.
  assert.equal(founderDiscoveries, 70);

  const reloaded = await bootSession(store, SEED);
  assert.equal(reloaded.snapshot.discoveries.length, founderDiscoveries);
  assert.equal(
    canonicalHash(reloaded.snapshot),
    canonicalHash(createWorld(SEED).snapshot),
  );
});

test("load refuses a schema newer than the build", async () => {
  const store = new MemoryWorldRepository();
  await bootSession(store, SEED);
  const tables = await store.readTables();
  assert.ok(tables);
  tables.world.schemaVersion = CURRENT_SCHEMA_VERSION + 1;
  const poisoned = new MemoryWorldRepository();
  await poisoned.insertWorld(tables);
  await assert.rejects(
    () => loadSnapshot(poisoned),
    (error: unknown) => error instanceof SchemaTooNewError,
  );
});

test("failed commit leaves the previous durable tick untouched", async () => {
  const store = new MemoryWorldRepository();
  const session = await bootSession(store, SEED);
  stepSession(session);
  await commitSession(session);
  assert.equal(session.snapshot.world.lastTick, 1);

  const before = snapshotCursors(session.snapshot);
  stepSession(session);
  assert.equal(session.snapshot.world.lastTick, 2);

  // Sabotage: reuse a worldgen event id so the insert must reject.
  const batch = buildCommitBatch(session.snapshot, session.dirty);
  batch.insertEvents.push({
    id: 1,
    worldId: session.snapshot.world.id,
    tick: 2,
    kind: "DEATH",
    actorId: 1,
    subjectId: null,
    territoryId: 1,
    lineageId: 1,
    summary: "sabotage",
    payload: {
      template: "death.v1",
      cause: "OLD_AGE",
      ageDays: 0,
      territoryId: 1,
      gestationLost: false,
    },
  });

  await assert.rejects(() => store.commit(batch));

  const durable = await loadSnapshot(store);
  assert.ok(durable);
  assert.equal(durable.world.lastTick, 1);
  assert.equal(before.nextCreatureId, durable.world.nextCreatureId);
});

test("markAfterTick dirties every living creature in the batch", () => {
  const snapshot = createWorld(SEED).snapshot;
  const dirty = createDirtySet();
  const before = snapshotCursors(snapshot);
  const { events } = step(snapshot);
  markAfterTick(dirty, before, snapshot, events);
  assert.equal(dirty.creatureIds.size, snapshot.creatures.length);
  for (const creature of snapshot.creatures) {
    assert.ok(dirty.creatureIds.has(creature.id));
  }
});

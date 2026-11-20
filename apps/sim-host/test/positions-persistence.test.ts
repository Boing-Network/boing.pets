/**
 * Schema 2 persistence: creature positions and the saved clock scale survive
 * reload, crash-redo, legacy (schema 1) saves, and the browser v1 → v2 key.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CURRENT_SCHEMA_VERSION,
  creatureToDb,
  mapCreature,
} from "@boing-pets/db";
import {
  POSITIONS_SCHEMA_VERSION,
  canonicalHash,
  settleSpot,
  type CreatureRow,
} from "@boing-pets/sim";
import {
  BROWSER_WORLD_STORAGE_KEY,
  BrowserWorldRepository,
  LEGACY_BROWSER_WORLD_STORAGE_KEYS,
  createMemoryStringStore,
} from "../src/persist/browser-repository";
import { MemoryWorldRepository } from "../src/persist/memory-repository";
import type { DurableTables } from "../src/persist/repository";
import { createHostRuntime } from "../src/runtime/host-runtime";
import {
  bootSession,
  commitSession,
  killSession,
  runBatch,
  stepSession,
} from "../src/session";

const SEED = 3;

type Spots = Array<[number, number, number, number, number]>;

function spots(creatures: readonly CreatureRow[]): Spots {
  return creatures.map((c) => [
    c.id,
    c.spotX,
    c.spotZ,
    c.fromSpotX,
    c.fromSpotZ,
  ]);
}

/** Rewrite saved tables the way a schema-1 build stored them. */
function toLegacyTables(tables: DurableTables): DurableTables {
  const legacy = JSON.parse(JSON.stringify(tables)) as DurableTables;
  legacy.world.schemaVersion = 1;
  delete legacy.hostClock;
  for (const creature of legacy.creatures) {
    const row = creature as Partial<CreatureRow>;
    delete row.spotX;
    delete row.spotZ;
    delete row.fromSpotX;
    delete row.fromSpotZ;
  }
  return legacy;
}

test("schema version is 2 for positions", () => {
  assert.equal(CURRENT_SCHEMA_VERSION, POSITIONS_SCHEMA_VERSION);
});

test("positions round-trip through commit and reload", async () => {
  const repository = new MemoryWorldRepository();
  const session = await bootSession(repository, SEED, { nowMs: 1 });
  for (let i = 0; i < 37; i += 1) stepSession(session);
  await commitSession(session);
  const before = spots(session.snapshot.creatures);
  const hash = canonicalHash(session.snapshot);
  assert.ok(before.some(([, x, z, fx, fz]) => x !== fx || z !== fz));

  const reloaded = await bootSession(repository, SEED, { nowMs: 1 });
  assert.deepEqual(spots(reloaded.snapshot.creatures), before);
  assert.equal(canonicalHash(reloaded.snapshot), hash);
});

test("crash mid-batch redoes the same movement as a clean run", async () => {
  const clean = await bootSession(new MemoryWorldRepository(), SEED, {
    nowMs: 1,
  });
  for (let i = 0; i < 18; i += 1) stepSession(clean);
  const cleanSpots = spots(clean.snapshot.creatures);
  const cleanHash = canonicalHash(clean.snapshot);

  const store = new MemoryWorldRepository();
  let crash = await bootSession(store, SEED, { nowMs: 1 });
  await runBatch(crash, 10, 10); // commits at 10
  await runBatch(crash, 5, 10); // in RAM only
  killSession(crash);

  crash = await bootSession(store, SEED, { nowMs: 1 });
  assert.equal(crash.snapshot.world.lastTick, 10);
  for (let i = 0; i < 8; i += 1) stepSession(crash);
  assert.deepEqual(spots(crash.snapshot.creatures), cleanSpots);
  assert.equal(canonicalHash(crash.snapshot), cleanHash);
});

test("prisma mappers carry the four position columns", async () => {
  const session = await bootSession(new MemoryWorldRepository(), SEED, {
    nowMs: 1,
  });
  for (let i = 0; i < 12; i += 1) stepSession(session);
  for (const creature of session.snapshot.creatures) {
    const dbRow = creatureToDb(creature);
    assert.equal(dbRow.spotX, creature.spotX);
    assert.equal(dbRow.fromSpotZ, creature.fromSpotZ);
    const back = mapCreature(
      dbRow as unknown as Parameters<typeof mapCreature>[0],
    );
    assert.deepEqual(
      [back.spotX, back.spotZ, back.fromSpotX, back.fromSpotZ],
      [creature.spotX, creature.spotZ, creature.fromSpotX, creature.fromSpotZ],
    );
  }
});

test("a schema 1 save loads with deterministic spots and is rewritten as v2", async () => {
  const source = new MemoryWorldRepository();
  const session = await bootSession(source, SEED, { nowMs: 1 });
  for (let i = 0; i < 25; i += 1) stepSession(session);
  await commitSession(session);
  const tables = await source.readTables();
  assert.ok(tables);
  const legacy = toLegacyTables(tables);

  // Two independent loads (e.g. crash before the first commit) agree.
  const storeA = new MemoryWorldRepository();
  await storeA.insertWorld(JSON.parse(JSON.stringify(legacy)));
  const storeB = new MemoryWorldRepository();
  await storeB.insertWorld(JSON.parse(JSON.stringify(legacy)));
  const a = await bootSession(storeA, SEED, { nowMs: 1 });
  const b = await bootSession(storeB, SEED, { nowMs: 1 });
  assert.equal(a.snapshot.world.schemaVersion, 2);
  assert.equal(canonicalHash(a.snapshot), canonicalHash(b.snapshot));
  for (const creature of a.snapshot.creatures) {
    assert.deepEqual(
      { x: creature.fromSpotX, z: creature.fromSpotZ },
      settleSpot(a.snapshot.world.seed, 25, creature.id),
    );
  }
  // Every upgraded row is dirty, so even a zero-tick commit rewrites them.
  assert.equal(a.dirty.creatureIds.size, a.snapshot.creatures.length);
  await commitSession(a);
  const stored = await storeA.readTables();
  assert.ok(stored);
  assert.equal(stored.world.schemaVersion, 2);
  const alive = new Set(a.snapshot.creatures.map((c) => c.id));
  for (const row of stored.creatures.filter((c) => alive.has(c.id))) {
    assert.deepEqual(
      { x: row.fromSpotX, z: row.fromSpotZ },
      settleSpot(a.snapshot.world.seed, 25, row.id),
    );
  }
  const reloaded = await bootSession(storeA, SEED, { nowMs: 1 });
  assert.equal(reloaded.dirty.creatureIds.size, 0, "no second upgrade");
  assert.equal(canonicalHash(reloaded.snapshot), canonicalHash(a.snapshot));
});

test("browser store migrates the v1 key to v2 and keeps v1 as a backup", async () => {
  const source = new MemoryWorldRepository();
  const session = await bootSession(source, SEED, { nowMs: 1 });
  for (let i = 0; i < 9; i += 1) stepSession(session);
  await commitSession(session);
  const tables = await source.readTables();
  assert.ok(tables);
  const legacyJson = JSON.stringify(toLegacyTables(tables));
  const legacyKey = LEGACY_BROWSER_WORLD_STORAGE_KEYS[0];
  const store = createMemoryStringStore({ [legacyKey]: legacyJson });

  const repository = new BrowserWorldRepository({ store });
  const booted = await bootSession(repository, SEED, { nowMs: 1 });
  assert.equal(booted.snapshot.world.lastTick, 9);
  assert.equal(booted.snapshot.world.schemaVersion, 2);
  assert.equal(await store.get(legacyKey), legacyJson, "v1 backup untouched");
  assert.ok((await store.get(BROWSER_WORLD_STORAGE_KEY)) != null);

  stepSession(booted);
  await commitSession(booted);
  const hash = canonicalHash(booted.snapshot);
  const again = await bootSession(new BrowserWorldRepository({ store }), SEED, {
    nowMs: 1,
  });
  assert.equal(again.snapshot.world.lastTick, 10);
  assert.equal(canonicalHash(again.snapshot), hash);
});

test("the chosen time scale survives a restart; initialScale only seeds new worlds", async () => {
  const store = createMemoryStringStore();
  const emit = (): void => {};
  const first = createHostRuntime({
    repository: new BrowserWorldRepository({ store }),
    seed: SEED,
    nowMs: () => 5_000,
    autoFrame: false,
    initialScale: 64,
    emit,
  });
  await first.start();
  assert.equal(first.clock.scale, 64);
  await first.handleCommand({ message: "clock.setScale", body: { scale: 4 } });
  await first.quit();

  const second = createHostRuntime({
    repository: new BrowserWorldRepository({ store }),
    seed: SEED,
    nowMs: () => 5_000,
    autoFrame: false,
    initialScale: 64,
    emit,
  });
  await second.start();
  assert.equal(second.clock.scale, 4);
  await second.quit();
});

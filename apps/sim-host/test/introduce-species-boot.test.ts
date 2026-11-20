/**
 * Introduce-species migration at host boot: a world stored by the
 * seven-species build gains the new species (two founders each) on the next
 * boot, committed before any tick; a second boot changes nothing.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { Diet, EventKind, SPECIES_CATALOG } from "@boing-pets/contract";
import { canonicalHash, createWorld, step } from "@boing-pets/sim";
import { MemoryWorldRepository } from "../src/persist/memory-repository";
import type { DurableTables } from "../src/persist/repository";
import { saveWorldgen } from "../src/persist/save";
import { bootSession, commitSession, stepSession } from "../src/session";

const LEGACY = new Set([1, 2, 3, 4, 5, 6, 7]);

async function legacyStore(): Promise<MemoryWorldRepository> {
  const { snapshot, events } = createWorld(5);
  snapshot.species = snapshot.species.filter((row) => LEGACY.has(row.id));
  for (const row of snapshot.species) row.diet = Diet.HERBIVORE;
  snapshot.compatibility = snapshot.compatibility.filter(
    (row) => LEGACY.has(row.speciesLowId) && LEGACY.has(row.speciesHighId),
  );
  snapshot.creatures = snapshot.creatures.filter((row) =>
    LEGACY.has(row.speciesId),
  );
  const creatures = new Set(snapshot.creatures.map((row) => row.id));
  const lineages = new Set(snapshot.creatures.map((row) => row.lineageId));
  snapshot.lineages = snapshot.lineages.filter((row) => lineages.has(row.id));
  snapshot.discoveries = snapshot.discoveries.filter((row) =>
    lineages.has(row.lineageId),
  );
  const kept = events.filter(
    (event) => event.actorId == null || creatures.has(event.actorId),
  );
  for (let i = 0; i < 40; i += 1) step(snapshot);
  const store = new MemoryWorldRepository();
  await saveWorldgen(store, snapshot, kept);
  return store;
}

test("boot introduces missing species with two founders each, committed at once", async () => {
  const store = await legacyStore();
  const before = await store.readTables();
  assert.ok(before);
  const session = await bootSession(store, 5);
  const added = SPECIES_CATALOG.filter((row) => !LEGACY.has(row.id));

  assert.ok(session.introduced);
  assert.equal(session.introduced.atTick, before.world.lastTick);
  assert.deepEqual(
    session.introduced.species,
    added.map((row) => row.slug),
  );
  assert.deepEqual(session.introduced.dietUpdates, ["fire-fox", "thistle-hog"]);
  assert.equal(session.introduced.founders, added.length * 2);

  const stored = await store.readTables();
  assert.ok(stored);
  const after: DurableTables = stored;
  assert.equal(after.world.lastTick, before.world.lastTick);
  assert.equal(after.species.length, SPECIES_CATALOG.length);
  // Nothing old is lost or rewritten: every legacy creature is still there.
  for (const creature of before.creatures) {
    const kept = after.creatures.find((row) => row.id === creature.id);
    assert.deepEqual(kept, creature);
  }
  for (const row of added) {
    const founders = after.creatures.filter(
      (creature) => creature.speciesId === row.id,
    );
    assert.equal(founders.length, 2, row.slug);
    assert.deepEqual(founders.map((c) => c.gender).sort(), ["FEMALE", "MALE"]);
  }
  const births = after.events.filter(
    (event) =>
      event.kind === EventKind.BIRTH && event.tick === before.world.lastTick,
  );
  assert.equal(births.length, added.length * 2);
  assert.equal(
    after.species.find((row) => row.slug === "fire-fox")?.diet,
    Diet.OMNIVORE,
  );
  // Durable state reloads to exactly what the session holds.
  const reboot = await bootSession(store, 5);
  assert.equal(reboot.introduced, null);
  assert.equal(canonicalHash(reboot.snapshot), canonicalHash(session.snapshot));
});

test("migrated world keeps stepping and committing", async () => {
  const store = await legacyStore();
  const session = await bootSession(store, 5);
  for (let i = 0; i < 30; i += 1) stepSession(session);
  await commitSession(session);
  const reboot = await bootSession(store, 5);
  assert.equal(reboot.introduced, null);
  assert.equal(canonicalHash(reboot.snapshot), canonicalHash(session.snapshot));
});

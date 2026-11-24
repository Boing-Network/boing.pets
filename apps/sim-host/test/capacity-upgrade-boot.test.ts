/**
 * Live-world upgrade at host boot: raise stored capacities to the catalog,
 * then introduce the 21 new species (42 founders) in the same commit,
 * without touching existing creatures.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { EventKind, SPECIES_CATALOG } from "@boing-pets/contract";
import {
  TERRITORY_CAPACITY_VERSION,
  TERRITORY_CATALOG,
  canonicalHash,
  createWorld,
} from "@boing-pets/sim";
import { MemoryWorldRepository } from "../src/persist/memory-repository";
import type { DurableTables } from "../src/persist/repository";
import { saveWorldgen } from "../src/persist/save";
import { bootSession, commitSession, stepSession } from "../src/session";

const LEGACY_SPECIES: ReadonlySet<number> = new Set(
  SPECIES_CATALOG.filter((row) => row.id <= 21).map((row) => row.id),
);

const LEGACY_CAPACITY: Readonly<Record<string, number>> = {
  meadow: 40,
  thicket: 30,
  ridge: 20,
  glade: 35,
  fen: 30,
  grove: 28,
  crags: 18,
};

async function liveLikeStore(): Promise<MemoryWorldRepository> {
  const { snapshot, events } = createWorld(1);
  snapshot.species = snapshot.species.filter((row) =>
    LEGACY_SPECIES.has(row.id),
  );
  snapshot.compatibility = snapshot.compatibility.filter(
    (row) =>
      LEGACY_SPECIES.has(row.speciesLowId) &&
      LEGACY_SPECIES.has(row.speciesHighId),
  );
  snapshot.creatures = snapshot.creatures.filter((row) =>
    LEGACY_SPECIES.has(row.speciesId),
  );
  const lineages = new Set(snapshot.creatures.map((row) => row.lineageId));
  snapshot.lineages = snapshot.lineages.filter((row) => lineages.has(row.id));
  snapshot.discoveries = snapshot.discoveries.filter((row) =>
    lineages.has(row.lineageId),
  );
  for (const territory of snapshot.territories) {
    const legacy = LEGACY_CAPACITY[territory.slug];
    if (legacy != null) territory.capacity = legacy;
  }
  const keptIds = new Set(snapshot.creatures.map((row) => row.id));
  const kept = events.filter(
    (event) => event.actorId == null || keptIds.has(event.actorId),
  );
  const store = new MemoryWorldRepository();
  await saveWorldgen(store, snapshot, kept);
  return store;
}

test("boot raises capacities then introduces 21 species, committed at once", async () => {
  const store = await liveLikeStore();
  const before = await store.readTables();
  assert.ok(before);
  assert.equal(before.creatures.length, 42);
  assert.equal(
    before.territories.reduce((sum, row) => sum + row.capacity, 0),
    201,
  );

  const session = await bootSession(store, 1);
  const added = SPECIES_CATALOG.filter((row) => row.id > 21);

  assert.ok(session.capacityUpgrade);
  assert.equal(session.capacityUpgrade.version, TERRITORY_CAPACITY_VERSION);
  assert.deepEqual(
    session.capacityUpgrade.changes.map((row) => [row.slug, row.from, row.to]),
    TERRITORY_CATALOG.map((row) => [
      row.slug,
      LEGACY_CAPACITY[row.slug],
      row.capacity,
    ]),
  );

  assert.ok(session.introduced);
  assert.equal(session.introduced.atTick, before.world.lastTick);
  assert.deepEqual(
    session.introduced.species,
    added.map((row) => row.slug),
  );
  assert.equal(session.introduced.founders, 42);
  assert.deepEqual(session.introduced.dietUpdates, []);

  const storedRaw = await store.readTables();
  assert.ok(storedRaw);
  const stored: DurableTables = storedRaw;
  assert.equal(stored.world.lastTick, before.world.lastTick);
  assert.equal(stored.species.length, SPECIES_CATALOG.length);
  assert.equal(stored.creatures.length, 84);
  assert.equal(
    stored.territories.reduce((sum, row) => sum + row.capacity, 0),
    420,
  );
  for (const row of TERRITORY_CATALOG) {
    const territory = stored.territories.find((t) => t.slug === row.slug)!;
    assert.equal(territory.capacity, row.capacity, row.slug);
  }
  // Every pre-existing creature is bit-identical; no lineage was rewritten.
  for (const creature of before.creatures) {
    assert.deepEqual(
      stored.creatures.find((row) => row.id === creature.id),
      creature,
    );
  }
  for (const lineage of before.lineages) {
    assert.deepEqual(
      stored.lineages.find((row) => row.id === lineage.id),
      lineage,
    );
  }
  for (const row of added) {
    const home = stored.territories.find((t) => t.slug === row.home);
    assert.ok(home, row.slug);
    const founders = stored.creatures.filter(
      (creature) => creature.speciesId === row.id,
    );
    assert.equal(founders.length, 2, row.slug);
    assert.deepEqual(founders.map((founder) => founder.gender).sort(), [
      "FEMALE",
      "MALE",
    ]);
    for (const founder of founders) {
      assert.equal(founder.territoryId, home.id, row.slug);
      assert.equal(founder.status, "ALIVE");
    }
  }
  const priorIds = new Set(before.creatures.map((row) => row.id));
  const births = stored.events.filter(
    (event) =>
      event.kind === EventKind.BIRTH &&
      event.tick === before.world.lastTick &&
      event.actorId != null &&
      !priorIds.has(event.actorId),
  );
  assert.equal(births.length, 42);

  const reboot = await bootSession(store, 1);
  assert.equal(reboot.capacityUpgrade, null);
  assert.equal(reboot.introduced, null);
  assert.equal(canonicalHash(reboot.snapshot), canonicalHash(session.snapshot));
});

test("upgraded world keeps stepping and a second boot is a no-op", async () => {
  const store = await liveLikeStore();
  const session = await bootSession(store, 1);
  for (let i = 0; i < 30; i += 1) stepSession(session);
  await commitSession(session);
  const reboot = await bootSession(store, 1);
  assert.equal(reboot.capacityUpgrade, null);
  assert.equal(reboot.introduced, null);
  assert.equal(canonicalHash(reboot.snapshot), canonicalHash(session.snapshot));
  assert.equal(
    reboot.snapshot.territories.reduce((sum, row) => sum + row.capacity, 0),
    420,
  );
});

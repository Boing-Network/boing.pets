import assert from "node:assert/strict";
import { test } from "node:test";
import { Diet, SPECIES_CATALOG } from "@boing-pets/contract";
import {
  INTRODUCED_FOUNDERS_PER_SPECIES,
  canonicalHash,
  createWorld,
  introduceSpecies,
  speciesUpToDate,
  step,
  type WorldSnapshot,
} from "../src/index";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * A world as the original seven-species build saved it: only species 1–7,
 * all HERBIVORE, then lived in for a while so cursors and lastTick moved.
 */
function legacyWorld(ticks = 300): WorldSnapshot {
  const { snapshot } = createWorld(3);
  const keep = new Set([1, 2, 3, 4, 5, 6, 7]);
  snapshot.species = snapshot.species.filter((row) => keep.has(row.id));
  for (const row of snapshot.species) row.diet = Diet.HERBIVORE;
  snapshot.compatibility = snapshot.compatibility.filter(
    (row) => keep.has(row.speciesLowId) && keep.has(row.speciesHighId),
  );
  const creatures = new Set(
    snapshot.creatures
      .filter((row) => keep.has(row.speciesId))
      .map((row) => row.id),
  );
  snapshot.creatures = snapshot.creatures.filter((row) =>
    creatures.has(row.id),
  );
  const lineages = new Set(snapshot.creatures.map((row) => row.lineageId));
  snapshot.lineages = snapshot.lineages.filter((row) => lineages.has(row.id));
  snapshot.discoveries = snapshot.discoveries.filter((row) =>
    lineages.has(row.lineageId),
  );
  for (let i = 0; i < ticks; i += 1) step(snapshot);
  return snapshot;
}

test("introduceSpecies adds every missing species with two founders at home", () => {
  const snapshot = legacyWorld();
  const before = clone(snapshot);
  assert.equal(speciesUpToDate(snapshot), false);
  const result = introduceSpecies(snapshot);

  assert.deepEqual(
    result.addedSpecies.map((row) => row.id),
    SPECIES_CATALOG.filter((row) => row.id > 7).map((row) => row.id),
  );
  assert.deepEqual(
    result.updatedSpecies.map((row) => [row.slug, row.diet]),
    [
      ["fire-fox", "OMNIVORE"],
      ["thistle-hog", "OMNIVORE"],
    ],
  );
  assert.equal(snapshot.species.length, SPECIES_CATALOG.length);
  const total = SPECIES_CATALOG.length;
  assert.equal(snapshot.compatibility.length, (total * (total + 1)) / 2);
  const fertile = snapshot.compatibility.filter((row) => row.fertility > 0);
  assert.equal(fertile.length, total);
  assert.ok(fertile.every((row) => row.speciesLowId === row.speciesHighId));

  assert.equal(
    result.creatures.length,
    (total - 7) * INTRODUCED_FOUNDERS_PER_SPECIES,
  );
  assert.equal(result.lineages.length, result.creatures.length);
  assert.equal(result.events.length, result.creatures.length * 2);
  assert.equal(result.creatures[0]?.id, before.world.nextCreatureId);
  assert.equal(
    snapshot.world.nextCreatureId,
    before.world.nextCreatureId + result.creatures.length,
  );
  assert.equal(
    snapshot.world.nextEventId,
    before.world.nextEventId + result.events.length,
  );
  const tick = snapshot.world.lastTick;
  assert.equal(tick, 300);
  for (const added of result.addedSpecies) {
    const catalog = SPECIES_CATALOG.find((row) => row.id === added.id)!;
    const home = snapshot.territories.find((row) => row.slug === catalog.home)!;
    const founders = result.creatures.filter(
      (row) => row.speciesId === added.id,
    );
    assert.deepEqual(
      founders.map((row) => row.gender),
      ["FEMALE", "MALE"],
    );
    for (const founder of founders) {
      assert.equal(founder.territoryId, home.id);
      assert.equal(
        founder.birthTick,
        tick - added.maturityDays * snapshot.ruleset.ticksPerDay,
      );
      assert.equal(founder.status, "ALIVE");
    }
  }
  for (const event of result.events) assert.equal(event.tick, tick);

  // Everything the world already had is untouched (except the two diets).
  for (const row of before.creatures) {
    assert.deepEqual(
      snapshot.creatures.find((other) => other.id === row.id),
      row,
    );
  }
  assert.deepEqual(snapshot.relationships, before.relationships);
  assert.deepEqual(snapshot.memories, before.memories);
  assert.deepEqual(snapshot.territories, before.territories);
  assert.deepEqual(snapshot.links, before.links);
  const names = new Set(snapshot.creatures.map((row) => row.name));
  assert.equal(names.size, snapshot.creatures.length, "names stay unique");
});

test("introduceSpecies is idempotent and deterministic", () => {
  const a = legacyWorld(120);
  const b = clone(a);
  introduceSpecies(a);
  introduceSpecies(b);
  assert.equal(canonicalHash(a), canonicalHash(b));
  assert.equal(speciesUpToDate(a), true);

  const hash = canonicalHash(a);
  const again = introduceSpecies(a);
  assert.deepEqual(again.addedSpecies, []);
  assert.deepEqual(again.updatedSpecies, []);
  assert.deepEqual(again.creatures, []);
  assert.deepEqual(again.events, []);
  assert.equal(canonicalHash(a), hash);

  // A fresh world is already up to date.
  const fresh = createWorld(1).snapshot;
  const freshHash = canonicalHash(fresh);
  assert.equal(speciesUpToDate(fresh), true);
  assert.deepEqual(introduceSpecies(fresh).creatures, []);
  assert.equal(canonicalHash(fresh), freshHash);
});

test("an introduced world keeps stepping", () => {
  const snapshot = legacyWorld(50);
  introduceSpecies(snapshot);
  for (let i = 0; i < 288; i += 1) step(snapshot);
  for (const species of SPECIES_CATALOG) {
    assert.ok(
      snapshot.creatures.some(
        (row) => row.speciesId === species.id && row.status === "ALIVE",
      ),
      species.slug,
    );
  }
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TERRITORY_CAPACITY_VERSION,
  TERRITORY_CATALOG,
  canonicalHash,
  createScaleWorld,
  createWorld,
  territoryCapacitiesUpToDate,
  upgradeTerritoryCapacities,
} from "../src/index";

/** Capacities stored by the 21-species live world (sum 201). */
const LEGACY_CAPACITY: Readonly<Record<string, number>> = {
  meadow: 40,
  thicket: 30,
  ridge: 20,
  glade: 35,
  fen: 30,
  grove: 28,
  crags: 18,
};

function withLegacyCapacities() {
  const { snapshot } = createWorld(1);
  for (const territory of snapshot.territories) {
    const legacy = LEGACY_CAPACITY[territory.slug];
    if (legacy != null) territory.capacity = legacy;
  }
  return snapshot;
}

test("raises only capacities on a standard world, then is a no-op", () => {
  const snapshot = withLegacyCapacities();
  const creatureIds = snapshot.creatures.map((row) => row.id);
  const lineageIds = snapshot.lineages.map((row) => row.id);
  const food = snapshot.territories.map((row) => row.foodAbundance);
  const danger = snapshot.territories.map((row) => row.danger);
  assert.equal(territoryCapacitiesUpToDate(snapshot), false);
  assert.equal(
    snapshot.territories.reduce((sum, row) => sum + row.capacity, 0),
    201,
  );

  const first = upgradeTerritoryCapacities(snapshot);
  assert.equal(first.version, TERRITORY_CAPACITY_VERSION);
  assert.equal(first.updated.length, TERRITORY_CATALOG.length);
  assert.deepEqual(
    first.changes.map((row) => [row.slug, row.from, row.to]),
    TERRITORY_CATALOG.map((row) => [
      row.slug,
      LEGACY_CAPACITY[row.slug],
      row.capacity,
    ]),
  );
  assert.equal(
    snapshot.territories.reduce((sum, row) => sum + row.capacity, 0),
    338,
  );
  for (const row of TERRITORY_CATALOG) {
    const stored = snapshot.territories.find((t) => t.slug === row.slug);
    assert.equal(stored?.capacity, row.capacity);
  }
  assert.deepEqual(
    snapshot.territories.map((row) => row.foodAbundance),
    food,
  );
  assert.deepEqual(
    snapshot.territories.map((row) => row.danger),
    danger,
  );
  assert.deepEqual(
    snapshot.creatures.map((row) => row.id),
    creatureIds,
  );
  assert.deepEqual(
    snapshot.lineages.map((row) => row.id),
    lineageIds,
  );
  assert.equal(territoryCapacitiesUpToDate(snapshot), true);

  const hash = canonicalHash(snapshot);
  const again = upgradeTerritoryCapacities(snapshot);
  assert.deepEqual(again.updated, []);
  assert.deepEqual(again.changes, []);
  assert.equal(canonicalHash(snapshot), hash);
});

test("a fresh world and a scale world are left alone", () => {
  const fresh = createWorld(1).snapshot;
  const freshHash = canonicalHash(fresh);
  assert.equal(territoryCapacitiesUpToDate(fresh), true);
  assert.deepEqual(upgradeTerritoryCapacities(fresh).updated, []);
  assert.equal(canonicalHash(fresh), freshHash);

  const scale = createScaleWorld(17, 50).snapshot;
  const scaleHash = canonicalHash(scale);
  assert.equal(territoryCapacitiesUpToDate(scale), true);
  assert.deepEqual(upgradeTerritoryCapacities(scale).updated, []);
  assert.equal(canonicalHash(scale), scaleHash);
  assert.ok(scale.territories.every((row) => row.capacity === 2000));
});

test("never lowers a capacity already above the catalog", () => {
  const snapshot = withLegacyCapacities();
  const meadow = snapshot.territories.find((row) => row.slug === "meadow");
  assert.ok(meadow);
  meadow.capacity = 80;
  const result = upgradeTerritoryCapacities(snapshot);
  assert.equal(meadow.capacity, 80);
  assert.ok(!result.changes.some((row) => row.slug === "meadow"));
  const crags = snapshot.territories.find((row) => row.slug === "crags");
  assert.equal(crags?.capacity, 36);
});

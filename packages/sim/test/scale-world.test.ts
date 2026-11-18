/**
 * M17 scale worldgen: seeded worlds with exactly N living founders.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canonicalHash,
  createScaleWorld,
  livingCountsPerSpecies,
} from "../src/index";

test("livingCountsPerSpecies splits remainder across earlier species", () => {
  assert.deepEqual(livingCountsPerSpecies(5000, 3), [1667, 1667, 1666]);
  assert.deepEqual(livingCountsPerSpecies(12, 3), [4, 4, 4]);
  assert.deepEqual(livingCountsPerSpecies(1, 3), [1, 0, 0]);
});

test("createScaleWorld(17, 5000) is deterministic with 5,000 living founders", () => {
  const a = createScaleWorld(17, 5000);
  const b = createScaleWorld(17, 5000);
  assert.equal(a.snapshot.creatures.length, 5000);
  assert.equal(
    a.snapshot.creatures.filter((row) => row.status === "ALIVE").length,
    5000,
  );
  assert.equal(a.snapshot.lineages.length, 5000);
  assert.equal(a.snapshot.world.lastTick, 0);
  assert.equal(a.snapshot.world.name, "Scale Rehearsal");
  assert.equal(a.events.length, 10_000);
  assert.equal(canonicalHash(a.snapshot), canonicalHash(b.snapshot));
  for (const territory of a.snapshot.territories) {
    assert.equal(territory.capacity, 2000);
  }
});

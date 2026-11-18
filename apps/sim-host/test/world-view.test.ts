import assert from "node:assert/strict";
import { test } from "node:test";
import { CreatureStatus } from "@boing-pets/contract";
import { createWorld } from "@boing-pets/sim";
import { buildWorldView } from "../src/view/world-view";

test("buildWorldView exposes three territories and living founders", () => {
  const { snapshot } = createWorld(1);
  const view = buildWorldView(snapshot);

  assert.equal(view.territories.length, 3);
  assert.deepEqual(view.territories.map((t) => t.slug).sort(), [
    "meadow",
    "ridge",
    "thicket",
  ]);
  assert.equal(view.links.length, 4);

  const living = view.creatures.filter(
    (c) => c.status === CreatureStatus.ALIVE,
  );
  assert.equal(living.length, 12);
  assert.ok(living.every((c) => c.ageDays === 0));
  assert.ok(living.every((c) => Number.isInteger(c.territoryId)));

  for (const territory of view.territories) {
    assert.equal(territory.food, territory.foodAbundance);
    assert.equal(territory.effectiveDanger, territory.danger);
    assert.ok(territory.population > 0);
  }

  assert.equal(view.world.seed, 1);
  assert.equal(view.lineages.length, 12);
  assert.ok(view.lineages.every((l) => l.extinct === false));
});

test("buildWorldView does not invent client-side rules", () => {
  const { snapshot } = createWorld(1);
  const view = buildWorldView(snapshot);
  const fernfoxHome = view.territories.find((t) => t.slug === "meadow");
  assert.ok(fernfoxHome);
  const meadowCreatures = view.creatures.filter(
    (c) => c.territoryId === fernfoxHome.id,
  );
  assert.equal(meadowCreatures.length, fernfoxHome.population);
});

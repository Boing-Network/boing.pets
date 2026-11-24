import assert from "node:assert/strict";
import { test } from "node:test";
import { CreatureStatus, ModifierKind } from "@boing-pets/contract";
import { createWorld, speciesCatalogRow } from "@boing-pets/sim";
import { buildWorldView } from "../src/view/world-view";

test("buildWorldView exposes seven territories and living founders", () => {
  const { snapshot } = createWorld(1);
  const view = buildWorldView(snapshot);

  assert.equal(view.territories.length, 7);
  assert.deepEqual(view.territories.map((t) => t.slug).sort(), [
    "crags",
    "fen",
    "glade",
    "grove",
    "meadow",
    "ridge",
    "thicket",
  ]);
  assert.equal(view.links.length, 14);

  const living = view.creatures.filter(
    (c) => c.status === CreatureStatus.ALIVE,
  );
  assert.equal(living.length, 84);
  // Founders arrive just mature: their age is their species' maturity.
  for (const c of living) {
    assert.equal(c.ageDays, speciesCatalogRow(c.speciesId)?.maturityDays);
  }
  assert.ok(living.every((c) => Number.isInteger(c.territoryId)));

  for (const territory of view.territories) {
    assert.equal(territory.food, territory.foodAbundance);
    assert.equal(territory.effectiveDanger, territory.danger);
    assert.ok(territory.population > 0);
  }

  assert.equal(view.world.seed, 1);
  assert.equal(view.lineages.length, 84);
  assert.ok(view.lineages.every((l) => l.extinct === false));
});

test("buildWorldView does not invent client-side rules", () => {
  const { snapshot } = createWorld(1);
  const view = buildWorldView(snapshot);
  const foxHome = view.territories.find((t) => t.slug === "meadow");
  assert.ok(foxHome);
  const meadowCreatures = view.creatures.filter(
    (c) => c.territoryId === foxHome.id,
  );
  assert.equal(meadowCreatures.length, foxHome.population);
});

test("M22: territory views carry active effects and gather stock", () => {
  const { snapshot } = createWorld(1);
  const tick = snapshot.world.lastTick;
  const meadow = snapshot.territories.find((t) => t.slug === "meadow")!;
  const grove = snapshot.territories.find((t) => t.slug === "grove")!;
  const base = { worldId: snapshot.world.id, sourceInfluenceId: null };
  snapshot.modifiers.push(
    {
      ...base,
      id: 9001,
      territoryId: meadow.id,
      kind: ModifierKind.HARVEST,
      amount: -20,
      startTick: tick,
      endTick: tick + 288,
    },
    {
      ...base,
      id: 9002,
      territoryId: grove.id,
      kind: ModifierKind.FOOD,
      amount: 100,
      startTick: tick,
      endTick: tick + 1008,
    },
    {
      ...base,
      id: 9003,
      territoryId: grove.id,
      kind: ModifierKind.DANGER,
      amount: -50,
      startTick: tick - 500,
      endTick: tick - 1,
    },
  );
  const view = buildWorldView(snapshot);
  const meadowView = view.territories.find((t) => t.id === meadow.id)!;
  const groveView = view.territories.find((t) => t.id === grove.id)!;

  assert.deepEqual(meadowView.resource, {
    slug: "resource.clover",
    free: 10,
    cap: 12,
  });
  assert.deepEqual(
    meadowView.effects?.map((e) => e.kind),
    [ModifierKind.HARVEST],
  );
  assert.deepEqual(groveView.resource, {
    slug: "resource.amber-resin",
    free: 12,
    cap: 12,
  });
  // Expired modifiers do not show; active ones carry their end tick.
  assert.deepEqual(groveView.effects, [
    { kind: ModifierKind.FOOD, amount: 100, endTick: tick + 1008 },
  ]);
  // Same snapshot, same view (pure).
  assert.deepEqual(buildWorldView(snapshot), view);
});

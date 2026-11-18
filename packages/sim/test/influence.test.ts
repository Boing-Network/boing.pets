/**
 * M14: five influence verbs. Enrich raises effective food without writing
 * territory.foodAbundance. Favor does not change health, genes, or needs.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { InfluenceKind, ModifierKind } from "@boing-pets/contract";
import {
  aggregateTerritories,
  createWorld,
  step,
  type CreatureRow,
  type WorldSnapshot,
} from "../src/index";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function world(): WorldSnapshot {
  return createWorld(1).snapshot;
}

function byId(snapshot: WorldSnapshot, id: number): CreatureRow {
  const row = snapshot.creatures.find((creature) => creature.id === id);
  assert.ok(row);
  return row;
}

function pinAll(snapshot: WorldSnapshot): void {
  for (const creature of snapshot.creatures) {
    creature.currentAction = "REST";
    creature.currentGoal = "SEEK_SHELTER";
    creature.actionTargetKind = "NONE";
    creature.actionTargetId = null;
    creature.actionStartedTick = 0;
    creature.actionEndsTick = 1_000_000;
  }
}

function needsSnapshot(creature: CreatureRow) {
  return {
    hunger: creature.hunger,
    thirst: creature.thirst,
    fatigue: creature.fatigue,
    discomfort: creature.discomfort,
    unsafety: creature.unsafety,
    loneliness: creature.loneliness,
    health: creature.health,
    geneStrength: creature.geneStrength,
    geneSpeed: creature.geneSpeed,
    geneIntelligence: creature.geneIntelligence,
    geneCuriosity: creature.geneCuriosity,
    geneSociability: creature.geneSociability,
  };
}

test("Enrich raises effective food without writing territory.foodAbundance", () => {
  const snapshot = world();
  pinAll(snapshot);
  const meadow = snapshot.territories.find((row) => row.slug === "meadow");
  assert.ok(meadow);
  const baseFood = meadow.foodAbundance;
  const before = aggregateTerritories(snapshot, 1).get(meadow.id);
  assert.ok(before);
  assert.equal(before.food, baseFood);

  snapshot.pendingInfluences.push({
    id: 1,
    worldId: 1,
    kind: InfluenceKind.ENRICH_TERRITORY,
    issuedAtTick: 1,
    payload: { territoryId: meadow.id },
    applied: false,
  });
  snapshot.world.nextInfluenceId = 2;

  step(snapshot);

  assert.equal(meadow.foodAbundance, baseFood);
  assert.equal(snapshot.pendingInfluences[0]?.applied, true);
  assert.equal(snapshot.modifiers.length, 1);
  const modifier = snapshot.modifiers[0];
  assert.ok(modifier);
  assert.equal(modifier.kind, ModifierKind.FOOD);
  assert.equal(modifier.amount, snapshot.ruleset.influenceFoodAmount);
  assert.equal(modifier.startTick, 1);
  assert.equal(
    modifier.endTick,
    1 + snapshot.ruleset.influenceModifierDays * snapshot.ruleset.ticksPerDay,
  );
  assert.equal(modifier.sourceInfluenceId, 1);
  assert.equal(snapshot.world.nextModifierId, 2);

  const after = aggregateTerritories(snapshot, 1).get(meadow.id);
  assert.ok(after);
  assert.equal(after.food, baseFood + snapshot.ruleset.influenceFoodAmount);
});

test("Calm lowers effective danger without writing territory.danger", () => {
  const snapshot = world();
  pinAll(snapshot);
  const ridge = snapshot.territories.find((row) => row.slug === "ridge");
  assert.ok(ridge);
  const baseDanger = ridge.danger;

  snapshot.pendingInfluences.push({
    id: 1,
    worldId: 1,
    kind: InfluenceKind.CALM_TERRITORY,
    issuedAtTick: 1,
    payload: { territoryId: ridge.id },
    applied: false,
  });

  step(snapshot);

  assert.equal(ridge.danger, baseDanger);
  const modifier = snapshot.modifiers[0];
  assert.ok(modifier);
  assert.equal(modifier.kind, ModifierKind.DANGER);
  assert.equal(modifier.amount, snapshot.ruleset.influenceDangerAmount);
  const after = aggregateTerritories(snapshot, 1).get(ridge.id);
  assert.ok(after);
  assert.equal(
    after.danger,
    baseDanger + snapshot.ruleset.influenceDangerAmount,
  );
});

test("Favor does not change health, genes, or needs", () => {
  const snapshot = world();
  pinAll(snapshot);
  const creature = byId(snapshot, 1);
  const beforeNeeds = needsSnapshot(creature);
  const lineage = snapshot.lineages.find(
    (row) => row.id === creature.lineageId,
  );
  assert.ok(lineage);
  assert.equal(lineage.playerFavor, 0);

  snapshot.pendingInfluences.push({
    id: 1,
    worldId: 1,
    kind: InfluenceKind.FAVOR_BLOODLINE,
    issuedAtTick: 1,
    payload: { lineageId: lineage.id },
    applied: false,
  });

  // Capture creature body before step; need drift will still run this tick,
  // so Favor's contract is: no *extra* change from the influence itself.
  // Compare against a twin world that steps without Favor.
  const twin = clone(snapshot);
  twin.pendingInfluences = [];

  step(snapshot);
  step(twin);

  const favored = byId(snapshot, 1);
  const control = byId(twin, 1);
  assert.deepEqual(needsSnapshot(favored), needsSnapshot(control));
  assert.equal(
    snapshot.lineages.find((row) => row.id === lineage.id)?.playerFavor,
    snapshot.ruleset.influenceFavorAmount,
  );
  assert.equal(
    twin.lineages.find((row) => row.id === lineage.id)?.playerFavor,
    0,
  );
  // Sanity: drift did move needs vs the pre-step snapshot.
  assert.notDeepEqual(needsSnapshot(favored), beforeNeeds);
});

test("Name creature and Name lineage write only name fields", () => {
  const snapshot = world();
  pinAll(snapshot);
  const creature = byId(snapshot, 1);
  const lineage = snapshot.lineages.find(
    (row) => row.id === creature.lineageId,
  );
  assert.ok(lineage);
  const beforeGenes = {
    geneStrength: creature.geneStrength,
    territoryId: creature.territoryId,
  };

  snapshot.pendingInfluences.push(
    {
      id: 1,
      worldId: 1,
      kind: InfluenceKind.NAME_CREATURE,
      issuedAtTick: 1,
      payload: { creatureId: creature.id, name: "PlayerPet" },
      applied: false,
    },
    {
      id: 2,
      worldId: 1,
      kind: InfluenceKind.NAME_LINEAGE,
      issuedAtTick: 1,
      payload: { lineageId: lineage.id, name: "Player Line" },
      applied: false,
    },
  );

  step(snapshot);

  assert.equal(byId(snapshot, 1).name, "PlayerPet");
  assert.equal(byId(snapshot, 1).nameGivenByPlayer, true);
  assert.equal(
    snapshot.lineages.find((row) => row.id === lineage.id)?.name,
    "Player Line",
  );
  assert.equal(byId(snapshot, 1).geneStrength, beforeGenes.geneStrength);
  assert.equal(byId(snapshot, 1).territoryId, beforeGenes.territoryId);
  assert.equal(
    snapshot.pendingInfluences.every((row) => row.applied),
    true,
  );
});

test("influences apply ascending id; shuffled queue order matches", () => {
  const forward = world();
  pinAll(forward);
  forward.pendingInfluences = [
    {
      id: 2,
      worldId: 1,
      kind: InfluenceKind.FAVOR_BLOODLINE,
      issuedAtTick: 1,
      payload: { lineageId: 1 },
      applied: false,
    },
    {
      id: 1,
      worldId: 1,
      kind: InfluenceKind.FAVOR_BLOODLINE,
      issuedAtTick: 1,
      payload: { lineageId: 1 },
      applied: false,
    },
  ];
  const backward = clone(forward);
  backward.pendingInfluences = clone(forward.pendingInfluences).reverse();
  backward.creatures.reverse();
  backward.lineages.reverse();

  step(forward);
  step(backward);

  assert.equal(
    forward.lineages.find((row) => row.id === 1)?.playerFavor,
    forward.ruleset.influenceFavorAmount * 2,
  );
  assert.equal(
    backward.lineages.find((row) => row.id === 1)?.playerFavor,
    backward.ruleset.influenceFavorAmount * 2,
  );
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Action,
  ActionTargetKind,
  CreatureStatus,
  Goal,
  MemoryKind,
  MemoryTag,
} from "@boing-pets/contract";
import {
  favorForageBonus,
  resolveDrink,
  resolveForage,
} from "../src/ai/actions";
import { decayLineageFavor } from "../src/kernel/influences";
import { aggregateTerritories } from "../src/kernel/territories";
import { clamp } from "../src/math";
import { rngInt } from "../src/rng";
import {
  canonicalHash,
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

function livingCount(snapshot: WorldSnapshot): number {
  return snapshot.creatures.filter(
    (creature) => creature.status === CreatureStatus.ALIVE,
  ).length;
}

function pinSlot(
  creature: CreatureRow,
  action: Action,
  endsTick: number,
): void {
  creature.currentAction = action;
  creature.actionTargetKind = ActionTargetKind.NONE;
  creature.actionTargetId = null;
  creature.actionStartedTick = endsTick - 1;
  creature.actionEndsTick = endsTick;
}

test("DRINK subtracts drinkThirstRelief and clears the action", () => {
  const snapshot = world();
  const founder = byId(snapshot, 1);
  const relief = snapshot.ruleset.drinkThirstRelief;
  founder.thirst = 800;
  pinSlot(founder, Action.DRINK, 1);
  resolveDrink(snapshot, founder);
  assert.equal(founder.thirst, 800 - relief);
  assert.equal(founder.currentAction, null);
  assert.equal(founder.actionEndsTick, null);
});

test("FORAGE success and failure match the ruleset chance formula", () => {
  const snapshot = world();
  const founder = byId(snapshot, 1);
  const rules = snapshot.ruleset;
  const tick = 1;
  snapshot.world.lastTick = 0;
  pinSlot(founder, Action.FORAGE, tick);
  founder.hunger = 600;
  founder.geneIntelligence = 500;

  const territories = aggregateTerritories(snapshot, tick);
  const territory = territories.get(founder.territoryId);
  assert.ok(territory);
  const chancePerMille = clamp(
    territory.food -
      territory.population * rules.foragePopPressure +
      Math.floor(founder.geneIntelligence / 5),
    rules.forageChanceMin,
    rules.forageChanceMax,
  );
  const roll = rngInt(
    snapshot.world.seed,
    tick,
    "forage",
    founder.id,
    0,
    0,
    999,
  );
  const success = roll < chancePerMille;
  const expected = clamp(
    600 - (success ? rules.forageHungerSuccess : rules.forageHungerFail),
    0,
    1000,
  );

  resolveForage(snapshot, founder, tick, territories);
  assert.equal(founder.hunger, expected);
  assert.equal(founder.currentAction, null);
  if (!success) {
    const threat = snapshot.memories.find(
      (memory) =>
        memory.creatureId === founder.id && memory.kind === MemoryKind.THREAT,
    );
    assert.ok(threat);
    assert.deepEqual(threat.payload.tags, [MemoryTag.FOOD_INSECURITY]);
  }
});

test("FORAGE gift uses pre-relief hunger and transfers to a friend", () => {
  const snapshot = world();
  const actor = byId(snapshot, 1);
  const recipient = byId(snapshot, 2);
  const rules = snapshot.ruleset;
  const tick = 1;

  // Force a success roll by maximizing food chance (meadow food is already high).
  actor.geneIntelligence = 1000;
  actor.hunger = rules.giftActorHungerMax - 1;
  recipient.hunger = rules.giftTargetHungerMin + 1;
  recipient.territoryId = actor.territoryId;
  pinSlot(actor, Action.FORAGE, tick);

  snapshot.relationships.push({
    id: snapshot.world.nextRelationshipId,
    worldId: snapshot.world.id,
    creatureAId: actor.id,
    creatureBId: recipient.id,
    score: 400,
    friendship: rules.giftFriendMin,
    romance: 0,
    trust: 0,
    cooperation: 0,
    avoidance: 0,
    conflict: 0,
    metTick: 0,
    lastInteractionTick: 0,
    interactionCount: 0,
  });
  snapshot.world.nextRelationshipId += 1;

  const territories = aggregateTerritories(snapshot, tick);
  const territory = territories.get(actor.territoryId);
  assert.ok(territory);
  const chancePerMille = clamp(
    territory.food -
      territory.population * rules.foragePopPressure +
      Math.floor(actor.geneIntelligence / 5),
    rules.forageChanceMin,
    rules.forageChanceMax,
  );
  const roll = rngInt(snapshot.world.seed, tick, "forage", actor.id, 0, 0, 999);
  assert.ok(
    roll < chancePerMille,
    "fixture expects a successful forage for the gift path",
  );

  const hungerBefore = actor.hunger;
  const recipientBefore = recipient.hunger;
  resolveForage(snapshot, actor, tick, territories);

  // Relief clamps first, then gift adds back onto the floored hunger.
  assert.equal(
    actor.hunger,
    clamp(
      clamp(hungerBefore - rules.forageHungerSuccess, 0, 1000) +
        rules.giftHungerActor,
      0,
      1000,
    ),
  );
  assert.equal(
    recipient.hunger,
    clamp(recipientBefore - rules.giftHungerTarget, 0, 1000),
  );
  const gifts = snapshot.memories.filter(
    (memory) => memory.kind === MemoryKind.GIFT,
  );
  assert.equal(gifts.length, 2);
});

test("a fixture world survives past the mass-thirst death tick", () => {
  // Without DRINK relief, thirst 300 + 7/tick hits 1000 at tick 100.
  const ticks = 144;
  const snapshot = world();
  for (let i = 0; i < ticks; i += 1) {
    step(snapshot);
  }
  assert.equal(snapshot.world.lastTick, ticks);
  const living = livingCount(snapshot);
  assert.ok(
    living > 0,
    `expected survivors after ${ticks} ticks, got ${living}`,
  );
  // At least one creature must have drunk enough that thirst is not terminal.
  const hydrated = snapshot.creatures.some(
    (creature) =>
      creature.status === CreatureStatus.ALIVE && creature.thirst < 1000,
  );
  assert.equal(hydrated, true);
});

test("forage and drink keep step deterministic across shuffled arrays", () => {
  const forward = world();
  const backward = clone(forward);
  backward.species.reverse();
  backward.compatibility.reverse();
  backward.territories.reverse();
  backward.links.reverse();
  backward.discoveries.reverse();
  backward.modifiers.reverse();
  backward.lineages.reverse();
  backward.creatures.reverse();
  backward.relationships.reverse();
  backward.memories.reverse();
  backward.pendingInfluences.reverse();

  for (let i = 0; i < 48; i += 1) {
    step(forward);
    step(backward);
  }
  assert.equal(canonicalHash(forward), canonicalHash(backward));
  assert.equal(livingCount(forward), livingCount(backward));
});

test("step applies DRINK relief when the action ends", () => {
  const snapshot = world();
  const founder = byId(snapshot, 1);
  for (const creature of snapshot.creatures) {
    if (creature.id === founder.id) continue;
    creature.currentGoal = Goal.SEEK_SHELTER;
    creature.currentAction = Action.REST;
    creature.actionTargetKind = ActionTargetKind.NONE;
    creature.actionTargetId = null;
    creature.actionStartedTick = 0;
    creature.actionEndsTick = 1_000_000;
  }
  founder.thirst = 700;
  founder.hunger = 100;
  founder.fatigue = 50;
  founder.discomfort = 20;
  founder.unsafety = 20;
  founder.loneliness = 20;
  founder.currentGoal = Goal.DRINK_WATER;
  pinSlot(founder, Action.DRINK, 1);

  step(snapshot);
  // Drift +7 then drink −600 → 107.
  assert.equal(founder.thirst, 700 + 7 - snapshot.ruleset.drinkThirstRelief);
});

test("FAVOR_BLOODLINE: a favored lineage forages with a bonus that fades daily", () => {
  const snapshot = world();
  const actor = snapshot.creatures.find(
    (c) => c.status === CreatureStatus.ALIVE,
  )!;
  const lineage = snapshot.lineages.find((l) => l.id === actor.lineageId)!;
  lineage.playerFavor = 0;
  assert.equal(favorForageBonus(snapshot, actor), 0);
  lineage.playerFavor = 100;
  assert.equal(favorForageBonus(snapshot, actor), 25, "100 favor = +2.5%");
  lineage.playerFavor = 1000;
  assert.equal(favorForageBonus(snapshot, actor), 250);

  // Find a tick where the unfavored roll fails but the favored one succeeds.
  const rules = snapshot.ruleset;
  const territories = aggregateTerritories(snapshot, 1);
  const territory = territories.get(actor.territoryId)!;
  const base = clamp(
    territory.food -
      territory.population * rules.foragePopPressure +
      Math.floor(actor.geneIntelligence / 5),
    rules.forageChanceMin,
    rules.forageChanceMax,
  );
  let tick = 1;
  for (; tick < 5000; tick += 1) {
    const roll = rngInt(
      snapshot.world.seed,
      tick,
      "forage",
      actor.id,
      0,
      0,
      999,
    );
    if (roll >= base && roll < Math.min(base + 250, rules.forageChanceMax)) {
      break;
    }
  }
  assert.ok(tick < 5000, "found a tick the favor bonus decides");
  const plain = clone(snapshot);
  plain.lineages.find((l) => l.id === actor.lineageId)!.playerFavor = 0;
  const favored = clone(snapshot);
  for (const s of [plain, favored]) {
    const a = byId(s, actor.id);
    a.hunger = 600;
    resolveForage(s, a, tick, aggregateTerritories(s, tick));
  }
  assert.equal(
    byId(plain, actor.id).hunger,
    600 - rules.forageHungerFail,
    "unfavored roll fails",
  );
  assert.equal(
    byId(favored, actor.id).hunger,
    600 - rules.forageHungerSuccess,
    "favored roll succeeds",
  );

  // Daily decay: only at day boundaries, never below 0.
  const decay = clone(snapshot);
  const fav = decay.lineages.find((l) => l.id === actor.lineageId)!;
  fav.playerFavor = 15;
  assert.deepEqual(decayLineageFavor(decay, rules.ticksPerDay - 1), []);
  assert.equal(fav.playerFavor, 15);
  assert.deepEqual(decayLineageFavor(decay, rules.ticksPerDay), [fav.id]);
  assert.equal(fav.playerFavor, 5);
  decayLineageFavor(decay, rules.ticksPerDay * 2);
  assert.equal(fav.playerFavor, 0);
});

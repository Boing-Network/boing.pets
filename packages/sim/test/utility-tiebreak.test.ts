import assert from "node:assert/strict";
import { test } from "node:test";
import { Goal, goalOrdinal } from "@boing-pets/contract";
import { aggregateTerritories } from "../src/kernel/territories";
import { chooseAndStartAction, startActionForGoal } from "../src/ai/actions";
import {
  betterTerms,
  chooseGoal,
  scoreEligibleGoals,
  scoreGoal,
  type GoalTerms,
} from "../src/ai/utility";
import {
  createWorld,
  step,
  type CreatureRow,
  type WorldSnapshot,
} from "../src/index";
import { divRound } from "../src/math";

function world(): WorldSnapshot {
  return createWorld(1).snapshot;
}

function byId(snapshot: WorldSnapshot, id: number): CreatureRow {
  const row = snapshot.creatures.find((creature) => creature.id === id);
  assert.ok(row);
  return row;
}

/**
 * Documented M6 fixture: a hungry, aggressive fire fox with calm companions
 * and low competing needs. Utility must select FIND_FOOD and start FORAGE.
 *
 * Terms at choice time (tick 0, no drift yet):
 * - FIND_FOOD Need = survivalUrgency(900) = 900 + (900 - 600) * 2 = 1500;
 *   Personality = 400 + floor(800/5) = 560
 * - DRINK_WATER Need = thirst 100; Personality = 400
 * - SEEK_SHELTER Need = max(100,50,40) = 100
 * - Memory term is 0 when the fixture has no matching memories
 */
function hungryAggressiveFixture(): {
  snapshot: WorldSnapshot;
  creature: CreatureRow;
} {
  const snapshot = world();
  const creature = byId(snapshot, 1);
  creature.hunger = 900;
  creature.thirst = 100;
  creature.fatigue = 100;
  creature.discomfort = 50;
  creature.unsafety = 40;
  creature.loneliness = 50;
  creature.health = 850;
  creature.traitAggression = 800;
  creature.traitBravery = 500;
  creature.traitRiskTaking = 500;
  creature.traitCuriosity = 200;
  creature.traitSociability = 200;
  creature.traitLoyalty = 200;
  creature.currentGoal = Goal.IDLE;
  creature.currentAction = null;
  creature.actionTargetKind = "NONE";
  creature.actionTargetId = null;
  creature.actionStartedTick = null;
  creature.actionEndsTick = null;
  return { snapshot, creature };
}

function terms(
  goal: Goal,
  need: number,
  personality: number,
  score: number,
): GoalTerms {
  return {
    goal,
    need,
    personality,
    relationship: 0,
    memory: 0,
    score,
  };
}

test("a hungry aggressive creature selects FIND_FOOD and starts FORAGE", () => {
  const { snapshot, creature } = hungryAggressiveFixture();
  const tick = 0;
  const scored = scoreEligibleGoals(snapshot, creature, tick);
  const food = scored.find((row) => row.goal === Goal.FIND_FOOD);
  const drink = scored.find((row) => row.goal === Goal.DRINK_WATER);
  assert.ok(food);
  assert.ok(drink);
  assert.equal(food.need, 1500);
  assert.equal(food.personality, 560);
  assert.equal(food.relationship, 400);
  assert.equal(food.memory, 0);
  assert.equal(
    food.score,
    divRound(
      snapshot.ruleset.weightNeed * 1500 +
        snapshot.ruleset.weightPersonality * 560 +
        snapshot.ruleset.weightRelationship * 400 +
        snapshot.ruleset.weightMemory * 0,
      100,
    ),
  );
  assert.ok(food.score > drink.score);
  assert.equal(chooseGoal(snapshot, creature, tick), Goal.FIND_FOOD);

  chooseAndStartAction(
    snapshot,
    creature,
    tick,
    aggregateTerritories(snapshot, tick),
  );
  assert.equal(creature.currentGoal, Goal.FIND_FOOD);
  assert.equal(creature.currentAction, "FORAGE");
  assert.equal(creature.actionTargetKind, "NONE");
  assert.equal(creature.actionTargetId, null);
  assert.equal(creature.actionStartedTick, 0);
  assert.equal(
    creature.actionEndsTick,
    Math.max(
      2,
      divRound(
        snapshot.ruleset.forageBaseDuration * 1000,
        500 + creature.geneSpeed,
      ),
    ),
  );

  const viaStep = hungryAggressiveFixture();
  viaStep.creature.hunger = 900;
  // Drift runs before choice inside step, so keep thirst low and hunger critical.
  viaStep.creature.thirst = 50;
  viaStep.creature.fatigue = 50;
  viaStep.creature.discomfort = 20;
  viaStep.creature.unsafety = 20;
  viaStep.creature.loneliness = 20;
  step(viaStep.snapshot);
  assert.equal(viaStep.creature.currentGoal, Goal.FIND_FOOD);
  assert.equal(viaStep.creature.currentAction, "FORAGE");
});

test("equal scores pick the lower goal ordinal", () => {
  assert.equal(goalOrdinal(Goal.FIND_FOOD), 0);
  assert.equal(goalOrdinal(Goal.DRINK_WATER), 1);

  const food = terms(Goal.FIND_FOOD, 400, 400, 500);
  const drink = terms(Goal.DRINK_WATER, 400, 400, 500);
  assert.equal(betterTerms(food, drink), true);
  assert.equal(betterTerms(drink, food), false);

  const snapshot = world();
  const creature = byId(snapshot, 1);
  creature.hunger = 400;
  creature.thirst = 400;
  creature.fatigue = 0;
  creature.discomfort = 0;
  creature.unsafety = 0;
  creature.loneliness = 0;
  creature.traitAggression = 0;
  creature.traitBravery = 1000;
  creature.traitRiskTaking = 1000;
  creature.traitCuriosity = 0;
  creature.traitSociability = 0;
  creature.traitLoyalty = 0;
  // Founders start mature; a mate cooldown keeps FIND_MATE out of this tie.
  creature.mateCooldownUntilTick = 1000;

  const foodTerms = scoreGoal(snapshot, creature, 0, Goal.FIND_FOOD);
  const drinkTerms = scoreGoal(snapshot, creature, 0, Goal.DRINK_WATER);
  // Personality: food = 400 + floor(0/5) = 400; drink = 400. Need both 400.
  assert.equal(foodTerms.need, drinkTerms.need);
  assert.equal(foodTerms.personality, drinkTerms.personality);
  assert.equal(foodTerms.relationship, drinkTerms.relationship);
  assert.equal(foodTerms.memory, drinkTerms.memory);
  assert.equal(foodTerms.score, drinkTerms.score);
  assert.equal(chooseGoal(snapshot, creature, 0), Goal.FIND_FOOD);

  // Higher Need still beats a lower ordinal when scores match.
  const thirsty = terms(Goal.DRINK_WATER, 500, 400, 500);
  const hungry = terms(Goal.FIND_FOOD, 400, 400, 500);
  assert.equal(betterTerms(thirsty, hungry), true);

  // Higher Personality beats Need ties when scores match.
  const braveShelter = terms(Goal.SEEK_SHELTER, 400, 500, 500);
  const plainFood = terms(Goal.FIND_FOOD, 400, 400, 500);
  assert.equal(betterTerms(braveShelter, plainFood), true);
});

test("FIND_FOOD action table prefers contest, then cooperate, then forage", () => {
  const snapshot = world();
  const actor = byId(snapshot, 1);
  const rival = byId(snapshot, 2);
  const tick = 0;
  actor.hunger = 700;
  actor.traitAggression = 600;
  rival.currentAction = "FORAGE";
  rival.traitAggression = 550;
  snapshot.modifiers.push({
    id: 1,
    worldId: 1,
    territoryId: actor.territoryId,
    kind: "FOOD",
    amount: -400,
    startTick: 0,
    endTick: 10,
    sourceInfluenceId: null,
  });
  const territories = aggregateTerritories(snapshot, tick);
  assert.ok(territories.get(actor.territoryId)!.food < 400);
  startActionForGoal(snapshot, actor, tick, Goal.FIND_FOOD, territories);
  assert.equal(actor.currentAction, "CONTEST");
  assert.equal(actor.actionTargetId, rival.id);
  assert.equal(actor.actionEndsTick, tick + snapshot.ruleset.contestDuration);

  const coop = world();
  const low = byId(coop, 1);
  const high = byId(coop, 2);
  low.hunger = 700;
  low.traitAggression = 100;
  coop.relationships.push({
    id: 1,
    worldId: 1,
    creatureAId: 1,
    creatureBId: 2,
    score: 0,
    friendship: 0,
    romance: 0,
    trust: 0,
    cooperation: 500,
    avoidance: 0,
    conflict: 0,
    metTick: 0,
    lastInteractionTick: 0,
    interactionCount: 1,
  });
  startActionForGoal(
    coop,
    low,
    0,
    Goal.FIND_FOOD,
    aggregateTerritories(coop, 0),
  );
  assert.equal(low.currentAction, "COOPERATE_FORAGE");
  assert.equal(low.actionTargetId, high.id);

  startActionForGoal(
    coop,
    high,
    0,
    Goal.FIND_FOOD,
    aggregateTerritories(coop, 0),
  );
  assert.equal(high.currentAction, "FORAGE");
});

test("ineligible goals are omitted and social needs a neighbor", () => {
  const alone = world();
  const creature = byId(alone, 1);
  alone.creatures = alone.creatures.filter((row) => row.id === 1);
  const scored = scoreEligibleGoals(alone, creature, 0);
  assert.equal(
    scored.some((row) => row.goal === Goal.SOCIALIZE),
    false,
  );
  assert.equal(
    scored.some((row) => row.goal === Goal.FIND_MATE),
    false,
  );
  assert.equal(
    scored.some((row) => row.goal === Goal.PROTECT_OFFSPRING),
    false,
  );
  assert.ok(scored.some((row) => row.goal === Goal.FIND_FOOD));
  assert.ok(scored.some((row) => row.goal === Goal.EXPLORE));
});

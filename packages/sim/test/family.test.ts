import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Action,
  ActionTargetKind,
  CreatureStatus,
  EventKind,
  Gender,
  Goal,
} from "@boing-pets/contract";
import {
  createFounderLineage,
  createWorld,
  generationForChild,
  lineageIdForChild,
  step,
  type CreatureRow,
  type WorldSnapshot,
} from "../src/index";

function world(): WorldSnapshot {
  return createWorld(1).snapshot;
}

function byId(snapshot: WorldSnapshot, id: number): CreatureRow {
  const row = snapshot.creatures.find((creature) => creature.id === id);
  assert.ok(row);
  return row;
}

function freezeLiving(snapshot: WorldSnapshot, untilTick: number): void {
  for (const creature of snapshot.creatures) {
    if (creature.status !== CreatureStatus.ALIVE) continue;
    creature.hunger = 200;
    creature.thirst = 200;
    creature.fatigue = 100;
    creature.discomfort = 50;
    creature.unsafety = 50;
    creature.loneliness = 100;
    creature.health = 900;
    creature.currentGoal = Goal.SEEK_SHELTER;
    creature.currentAction = Action.REST;
    creature.actionTargetKind = ActionTargetKind.NONE;
    creature.actionTargetId = null;
    creature.actionStartedTick = snapshot.world.lastTick;
    creature.actionEndsTick = untilTick;
  }
}

function prepareMates(
  snapshot: WorldSnapshot,
  mother: CreatureRow,
  father: CreatureRow,
  courtEndTick: number,
): void {
  const rules = snapshot.ruleset;
  freezeLiving(snapshot, courtEndTick + 1_000_000);

  for (const creature of [mother, father]) {
    creature.birthTick = -rules.ticksPerDay * 200;
    creature.hunger = 100;
    creature.thirst = 100;
    creature.health = 900;
    creature.gestationSireId = null;
    creature.gestationEndTick = null;
    creature.mateCooldownUntilTick = null;
  }

  const pair = snapshot.relationships.find(
    (row) =>
      (row.creatureAId === mother.id && row.creatureBId === father.id) ||
      (row.creatureAId === father.id && row.creatureBId === mother.id),
  );
  if (pair) {
    pair.score = 500;
    pair.romance = 500;
    pair.conflict = 0;
    pair.lastInteractionTick = courtEndTick;
  } else {
    snapshot.relationships.push({
      id: snapshot.world.nextRelationshipId,
      worldId: snapshot.world.id,
      creatureAId: Math.min(mother.id, father.id),
      creatureBId: Math.max(mother.id, father.id),
      score: 500,
      friendship: 200,
      romance: 500,
      trust: 100,
      cooperation: 50,
      avoidance: 0,
      conflict: 0,
      metTick: 0,
      lastInteractionTick: courtEndTick,
      interactionCount: 1,
    });
    snapshot.world.nextRelationshipId += 1;
  }

  mother.currentGoal = Goal.FIND_MATE;
  mother.currentAction = Action.COURT;
  mother.actionTargetKind = ActionTargetKind.CREATURE;
  mother.actionTargetId = father.id;
  mother.actionStartedTick = courtEndTick - rules.courtDuration;
  mother.actionEndsTick = courtEndTick;
}

test("lineageIdForChild equals the mother's lineageId", () => {
  assert.equal(lineageIdForChild({ lineageId: 7 }), 7);
  assert.equal(generationForChild({ generation: 2 }, { generation: 5 }), 6);
  assert.equal(generationForChild({ generation: 4 }, { generation: 1 }), 5);
});

test("createFounderLineage names the bloodline from the founder", () => {
  const lineage = createFounderLineage({
    id: 3,
    worldId: 1,
    founderCreatureId: 9,
    speciesId: 1,
    founderName: "Bri",
    foundedTick: 0,
  });
  assert.equal(lineage.name, "Bri line");
  assert.equal(lineage.founderCreatureId, 9);
  assert.equal(lineage.playerFavor, 0);
});

test("birth assigns the mother's lineageId, not the father's", () => {
  const snapshot = world();
  const mother = byId(snapshot, 1);
  const father = byId(snapshot, 2);
  assert.equal(mother.gender, Gender.FEMALE);
  assert.equal(father.gender, Gender.MALE);
  assert.notEqual(mother.lineageId, father.lineageId);

  const courtTick = 10;
  prepareMates(snapshot, mother, father, courtTick);
  snapshot.world.lastTick = courtTick - 1;
  step(snapshot);

  const species = snapshot.species.find((row) => row.id === mother.speciesId);
  assert.ok(species);
  const birthTick =
    courtTick + species.gestationDays * snapshot.ruleset.ticksPerDay;
  freezeLiving(snapshot, birthTick + 1_000_000);
  mother.gestationSireId = father.id;
  mother.gestationEndTick = birthTick;

  const expectedChildId = snapshot.world.nextCreatureId;
  snapshot.world.lastTick = birthTick - 1;
  const birthStep = step(snapshot);
  assert.equal(
    birthStep.events.filter((event) => event.kind === EventKind.BIRTH).length,
    1,
  );

  const child = byId(snapshot, expectedChildId);
  assert.equal(child.lineageId, mother.lineageId);
  assert.equal(child.lineageId, lineageIdForChild(mother));
  assert.notEqual(child.lineageId, father.lineageId);
  assert.equal(child.generation, generationForChild(mother, father));
});

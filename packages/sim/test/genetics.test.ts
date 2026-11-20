import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Action,
  ActionTargetKind,
  EventKind,
  Gender,
  Goal,
  MemoryKind,
} from "@boing-pets/contract";
import {
  RULESET_V1,
  createWorld,
  inheritGenes,
  mutationDelta,
  rngInt,
  step,
  type CreatureRow,
  type WorldSnapshot,
} from "../src/index";
import { clamp, divRound } from "../src/math";

function world(): WorldSnapshot {
  return createWorld(1).snapshot;
}

function byId(snapshot: WorldSnapshot, id: number): CreatureRow {
  const row = snapshot.creatures.find((creature) => creature.id === id);
  assert.ok(row);
  return row;
}

/** Pin every living creature so long jumps do not starve or re-act. */
function freezeLiving(snapshot: WorldSnapshot, untilTick: number): void {
  for (const creature of snapshot.creatures) {
    if (creature.status !== "ALIVE") continue;
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

/** Fernfox founders: id 1 female, id 2 male (slug order, even/odd index). */
function matingPair(snapshot: WorldSnapshot): {
  mother: CreatureRow;
  father: CreatureRow;
} {
  const mother = byId(snapshot, 1);
  const father = byId(snapshot, 2);
  assert.equal(mother.gender, Gender.FEMALE);
  assert.equal(father.gender, Gender.MALE);
  assert.equal(mother.speciesId, father.speciesId);
  return { mother, father };
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

  mother.geneStrength = 400;
  mother.geneSpeed = 500;
  mother.geneIntelligence = 600;
  mother.geneCuriosity = 700;
  mother.geneSociability = 300;
  father.geneStrength = 600;
  father.geneSpeed = 500;
  father.geneIntelligence = 400;
  father.geneCuriosity = 500;
  father.geneSociability = 500;

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

test("mutationDelta forces a non-zero roll for a known genetics case", () => {
  const rules = RULESET_V1;
  let found: { childId: number; geneIndex: number; delta: number } | null =
    null;
  for (let childId = 13; childId < 5_000 && !found; childId += 1) {
    for (let geneIndex = 0; geneIndex < 5; geneIndex += 1) {
      const roll = rngInt(1, 100, "genetics", childId, geneIndex, 0, 999);
      if (roll >= rules.minorMutationBelow) continue;
      const { delta, rare } = mutationDelta(1, 100, childId, geneIndex, rules);
      assert.notEqual(delta, 0);
      assert.equal(rare, roll < rules.rareMutationBelow);
      found = { childId, geneIndex, delta };
      break;
    }
  }
  assert.ok(found);
});

test("inheritGenes matches blend plus forced mutation roll", () => {
  const snapshot = world();
  const { mother, father } = matingPair(snapshot);
  mother.geneStrength = 400;
  father.geneStrength = 600;
  mother.geneSpeed = 200;
  father.geneSpeed = 800;
  mother.geneIntelligence = 100;
  father.geneIntelligence = 100;
  mother.geneCuriosity = 0;
  father.geneCuriosity = 0;
  mother.geneSociability = 1000;
  father.geneSociability = 1000;

  const birthTick = 100;
  // Pick a child id whose strength gene mutates.
  let childId = 13;
  let strengthDelta = 0;
  for (let id = 13; id < 5_000; id += 1) {
    const { delta } = mutationDelta(1, birthTick, id, 0, RULESET_V1);
    if (delta !== 0) {
      childId = id;
      strengthDelta = delta;
      break;
    }
  }
  assert.notEqual(strengthDelta, 0);

  const { genes, mutations } = inheritGenes(
    1,
    birthTick,
    childId,
    mother,
    father,
    RULESET_V1,
  );

  const expectedStrength = clamp(
    divRound(400 + 600, 2) + strengthDelta,
    0,
    1000,
  );
  assert.equal(genes.strength, expectedStrength);
  assert.equal(genes.speed, divRound(200 + 800, 2));
  assert.equal(genes.intelligence, 100);
  assert.equal(genes.curiosity, 0);
  assert.equal(genes.sociability, 1000);
  assert.ok(
    mutations.some(
      (row) => row.gene === "strength" && row.delta === strengthDelta,
    ),
  );
  assert.deepEqual(genes.extra, {});
});

test("one MATING, one BIRTH, litter size 1, child genes match blend", () => {
  const snapshot = world();
  const { mother, father } = matingPair(snapshot);
  const courtTick = 10;
  prepareMates(snapshot, mother, father, courtTick);

  snapshot.world.lastTick = courtTick - 1;
  const matingStep = step(snapshot);
  const matings = matingStep.events.filter(
    (event) => event.kind === EventKind.MATING,
  );
  assert.equal(matings.length, 1);
  const mating = matings[0]!;
  assert.equal(mating.actorId, mother.id);
  assert.equal(mating.subjectId, father.id);
  assert.equal(mating.payload.template, "mating.v1");
  if (mating.payload.template !== "mating.v1") throw new Error("mating");
  assert.equal(mating.payload.motherId, mother.id);
  assert.equal(mating.payload.fatherId, father.id);

  assert.equal(mother.gestationSireId, father.id);
  const species = snapshot.species.find((row) => row.id === mother.speciesId);
  assert.ok(species);
  const birthTick =
    courtTick + species.gestationDays * snapshot.ruleset.ticksPerDay;
  assert.equal(mother.gestationEndTick, birthTick);
  assert.ok(mother.mateCooldownUntilTick != null);
  assert.ok(father.mateCooldownUntilTick != null);
  assert.ok(
    snapshot.memories.some(
      (memory) =>
        memory.kind === MemoryKind.MATE && memory.creatureId === mother.id,
    ),
  );
  assert.ok(
    snapshot.memories.some(
      (memory) =>
        memory.kind === MemoryKind.MATE && memory.creatureId === father.id,
    ),
  );

  const beforeCount = snapshot.creatures.length;
  const expectedChildId = snapshot.world.nextCreatureId;
  const { genes: expectedGenes, mutations: expectedMutations } = inheritGenes(
    snapshot.world.seed,
    birthTick,
    expectedChildId,
    mother,
    father,
    snapshot.ruleset,
  );

  freezeLiving(snapshot, birthTick + 1_000_000);
  // Keep gestation fields; freezeLiving does not clear them.
  mother.gestationSireId = father.id;
  mother.gestationEndTick = birthTick;

  snapshot.world.lastTick = birthTick - 1;
  const birthStep = step(snapshot);
  const births = birthStep.events.filter(
    (event) => event.kind === EventKind.BIRTH,
  );
  assert.equal(births.length, 1);
  assert.equal(
    birthStep.events.filter((event) => event.kind === EventKind.MATING).length,
    0,
  );
  assert.equal(snapshot.creatures.length, beforeCount + 1);
  assert.equal(snapshot.ruleset.litterSize, 1);

  const child = byId(snapshot, expectedChildId);
  assert.equal(child.motherId, mother.id);
  assert.equal(child.fatherId, father.id);
  assert.equal(child.lineageId, mother.lineageId);
  assert.equal(
    child.generation,
    Math.max(mother.generation, father.generation) + 1,
  );
  assert.equal(child.geneStrength, expectedGenes.strength);
  assert.equal(child.geneSpeed, expectedGenes.speed);
  assert.equal(child.geneIntelligence, expectedGenes.intelligence);
  assert.equal(child.geneCuriosity, expectedGenes.curiosity);
  assert.equal(child.geneSociability, expectedGenes.sociability);
  assert.equal(child.currentAction, Action.NURSE);
  assert.equal(child.actionEndsTick, birthTick + 1);
  assert.equal(mother.gestationEndTick, null);
  assert.equal(mother.gestationSireId, null);

  const birth = births[0]!;
  assert.equal(birth.actorId, child.id);
  assert.equal(birth.subjectId, mother.id);
  assert.equal(birth.payload.template, "birth.v1");
  if (birth.payload.template !== "birth.v1") throw new Error("birth");
  assert.deepEqual(birth.payload.mutations, expectedMutations);
  assert.deepEqual(birth.payload.genes, {
    strength: expectedGenes.strength,
    speed: expectedGenes.speed,
    intelligence: expectedGenes.intelligence,
    curiosity: expectedGenes.curiosity,
    sociability: expectedGenes.sociability,
    extra: {},
  });

  assert.ok(
    snapshot.memories.some(
      (memory) =>
        memory.kind === MemoryKind.FIRST_CHILD &&
        memory.creatureId === mother.id &&
        memory.subjectCreatureId === child.id,
    ),
  );
  assert.ok(
    snapshot.relationships.some(
      (row) =>
        (row.creatureAId === mother.id && row.creatureBId === child.id) ||
        (row.creatureAId === child.id && row.creatureBId === mother.id),
    ),
  );
  assert.ok(
    snapshot.relationships.some(
      (row) =>
        (row.creatureAId === father.id && row.creatureBId === child.id) ||
        (row.creatureAId === child.id && row.creatureBId === father.id),
    ),
  );
});

test("court reject bumps romance, familiarity and a little avoidance without MATING", () => {
  const snapshot = world();
  const { mother, father } = matingPair(snapshot);
  const courtTick = 10;
  prepareMates(snapshot, mother, father, courtTick);
  const pair = snapshot.relationships.find(
    (row) =>
      row.creatureAId === Math.min(mother.id, father.id) &&
      row.creatureBId === Math.max(mother.id, father.id),
  );
  assert.ok(pair);
  pair.romance = 100;
  pair.score = 500;
  pair.avoidance = 0;

  snapshot.world.lastTick = courtTick - 1;
  const result = step(snapshot);
  assert.equal(
    result.events.filter((event) => event.kind === EventKind.MATING).length,
    0,
  );
  assert.equal(mother.gestationEndTick, null);
  assert.equal(pair.romance, 105);
  // A refusal still builds familiarity (+4 score) and barely any avoidance.
  assert.equal(pair.score, 504);
  assert.equal(pair.avoidance, 1);
});

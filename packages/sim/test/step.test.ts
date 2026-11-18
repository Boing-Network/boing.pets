import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canonicalHash,
  createWorld,
  step,
  type CreatureRow,
  type WorldEvent,
  type WorldSnapshot,
} from "../src/index";
import { divRound } from "../src/math";

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

function deathOf(events: readonly WorldEvent[], index = 0) {
  const event = events[index];
  assert.ok(event);
  assert.equal(event.kind, "DEATH");
  assert.equal(event.payload.template, "death.v1");
  if (event.payload.template !== "death.v1") throw new Error("death");
  return { event, payload: event.payload };
}

function reverseArrays(snapshot: WorldSnapshot): WorldSnapshot {
  const copy = clone(snapshot);
  copy.species.reverse();
  copy.compatibility.reverse();
  copy.territories.reverse();
  copy.links.reverse();
  copy.discoveries.reverse();
  copy.modifiers.reverse();
  copy.lineages.reverse();
  copy.creatures.reverse();
  copy.relationships.reverse();
  copy.memories.reverse();
  copy.pendingInfluences.reverse();
  return copy;
}

test("a starved founder emits one DEATH and stays dead", () => {
  const snapshot = world();
  const founder = byId(snapshot, 1);
  const neighbor = byId(snapshot, 2);
  const home = snapshot.territories.find(
    (row) => row.id === founder.territoryId,
  );
  assert.ok(home);
  founder.hunger = 996;

  const first = step(snapshot);
  assert.equal(first.snapshot, snapshot);
  assert.equal(snapshot.world.lastTick, 1);
  assert.equal(snapshot.world.clockAtMs, 0);
  assert.equal(snapshot.world.nextEventId, 26);
  assert.equal(snapshot.world.nextMemoryId, 1);
  assert.equal(snapshot.world.nextCreatureId, 13);
  assert.equal(snapshot.creatures.length, 12);
  assert.equal(
    snapshot.creatures.filter((creature) => creature.status === "DEAD").length,
    1,
  );
  assert.equal(founder.status, "DEAD");
  assert.equal(founder.deathTick, 1);
  assert.equal(founder.deathCause, "STARVATION");
  assert.equal(founder.hunger, 1000);
  assert.equal(founder.thirst, 307);
  assert.equal(founder.health, 810);
  assert.equal(founder.currentAction, null);
  assert.equal(neighbor.status, "ALIVE");
  assert.equal(neighbor.hunger, 304);
  assert.deepEqual(first.events, [
    {
      id: 25,
      worldId: 1,
      tick: 1,
      kind: "DEATH",
      actorId: 1,
      subjectId: null,
      territoryId: home.id,
      lineageId: founder.lineageId,
      summary: "Torkaeith died of starvation in Meadow at age 0.",
      payload: {
        template: "death.v1",
        cause: "STARVATION",
        ageDays: 0,
        territoryId: home.id,
        gestationLost: false,
      },
    },
  ]);

  const second = step(snapshot);
  assert.deepEqual(second.events, []);
  assert.equal(snapshot.world.lastTick, 2);
  assert.equal(snapshot.world.nextEventId, 26);
  assert.equal(founder.status, "DEAD");
  assert.equal(founder.deathTick, 1);
  assert.equal(founder.deathCause, "STARVATION");
  assert.equal(founder.hunger, 1000);
  assert.equal(founder.thirst, 307);
  assert.equal(founder.health, 810);
  assert.equal(neighbor.status, "ALIVE");
  assert.equal(neighbor.hunger, 308);
  assert.equal(neighbor.thirst, 314);
  assert.equal(neighbor.health, 860);
});

test("shuffled rows tick to the same hash", () => {
  const forward = world();
  const backward = reverseArrays(world());
  byId(forward, 1).hunger = 996;
  byId(backward, 1).hunger = 996;

  const left = step(forward);
  const right = step(backward);
  assert.deepEqual(left.events, right.events);
  assert.equal(canonicalHash(forward), canonicalHash(backward));

  const again = createWorld(1).snapshot;
  byId(again, 1).hunger = 996;
  step(again);
  assert.equal(canonicalHash(again), canonicalHash(forward));

  step(forward);
  step(backward);
  assert.equal(canonicalHash(forward), canonicalHash(backward));
  assert.equal(forward.world.lastTick, 2);
});

test("awake drift uses territory danger and the ruleset", () => {
  const snapshot = world();
  const drifted = step(snapshot);
  assert.deepEqual(drifted.events, []);
  const meadow = byId(snapshot, 1);
  const thicket = byId(snapshot, 5);
  const ridge = byId(snapshot, 9);
  assert.deepEqual(
    [
      meadow.hunger,
      meadow.thirst,
      meadow.fatigue,
      meadow.discomfort,
      meadow.unsafety,
      meadow.loneliness,
      meadow.health,
    ],
    [304, 307, 203, 101, 48, 202, 855],
  );
  assert.equal(thicket.unsafety, 98);
  assert.equal(thicket.discomfort, 101);
  assert.equal(thicket.health, 855);
  assert.equal(ridge.discomfort, 103);
  assert.equal(ridge.unsafety, 148);
  assert.equal(ridge.health, 855);
  assert.ok(meadow.currentAction);
  assert.ok(meadow.currentGoal !== "IDLE");
  assert.equal(snapshot.world.lastTick, 1);

  const custom = world();
  custom.ruleset.hungerPerTick = 0;
  custom.ruleset.healthCriticalPerTick = 0;
  custom.ruleset.discomfortDangerThreshold = 100;
  byId(custom, 1).hunger = 996;
  step(custom);
  const stayed = byId(custom, 1);
  assert.equal(stayed.status, "ALIVE");
  assert.equal(stayed.hunger, 996);
  assert.equal(stayed.health, 850);
  assert.equal(stayed.discomfort, 103);

  const faster = world();
  faster.ruleset.hungerPerTick = 10;
  byId(faster, 1).hunger = 990;
  const died = step(faster);
  assert.equal(byId(faster, 1).status, "DEAD");
  assert.equal(byId(faster, 1).deathCause, "STARVATION");
  const fasterDeath = deathOf(died.events);
  assert.equal(fasterDeath.payload.cause, "STARVATION");
  assert.equal(fasterDeath.payload.ageDays, 0);

  const aged = world();
  aged.ruleset.ticksPerDay = 1;
  byId(aged, 1).hunger = 996;
  const agedDeath = deathOf(step(aged).events);
  assert.equal(agedDeath.payload.ageDays, 1);
  assert.equal(agedDeath.payload.cause, "STARVATION");
  assert.equal(
    agedDeath.event.summary,
    "Torkaeith died of starvation in Meadow at age 1.",
  );
});

test("rest, nurse, and approach change only their drift terms", () => {
  const snapshot = world();
  const resting = byId(snapshot, 1);
  const nursing = byId(snapshot, 2);
  const alone = byId(snapshot, 3);
  const approaching = byId(snapshot, 4);
  resting.currentAction = "REST";
  resting.unsafety = 100;
  nursing.currentAction = "NURSE";
  nursing.motherId = resting.id;
  alone.currentAction = "NURSE";
  approaching.currentAction = "APPROACH";

  step(snapshot);

  assert.deepEqual(
    [resting.hunger, resting.thirst, resting.fatigue, resting.discomfort],
    [304, 307, 188, 95],
  );
  assert.equal(resting.unsafety, 88);
  assert.equal(resting.loneliness, 202);
  assert.equal(resting.health, 855);
  assert.equal(resting.currentAction, "REST");
  assert.deepEqual(
    [nursing.hunger, nursing.thirst, nursing.fatigue, nursing.loneliness],
    [302, 303, 201, 180],
  );
  assert.equal(alone.loneliness, 202);
  assert.equal(alone.hunger, 302);
  assert.equal(approaching.loneliness, 200);
  assert.equal(approaching.hunger, 304);
  assert.equal(snapshot.world.nextEventId, 25);
});

test("health penalties follow the ruleset thresholds", () => {
  const critical = world();
  byId(critical, 1).hunger = 947;
  step(critical);
  assert.equal(byId(critical, 1).hunger, 951);
  assert.equal(byId(critical, 1).health, 810);
  assert.equal(byId(critical, 1).status, "ALIVE");

  const pressed = world();
  byId(pressed, 1).hunger = 946;
  step(pressed);
  assert.equal(byId(pressed, 1).hunger, 950);
  assert.equal(byId(pressed, 1).health, 835);

  const boundary = world();
  const calm = byId(boundary, 1);
  calm.hunger = 796;
  calm.thirst = 500;
  step(boundary);
  assert.equal(calm.hunger, 800);
  assert.equal(calm.thirst, 507);
  assert.equal(calm.health, 850);

  const both = world();
  both.ruleset.healthExhaustThreshold = 100;
  step(both);
  assert.equal(byId(both, 1).fatigue, 203);
  assert.equal(byId(both, 1).health, 850);

  const illness = world();
  const sick = byId(illness, 1);
  sick.health = 10;
  sick.hunger = 990;
  const illnessStep = step(illness);
  assert.equal(sick.status, "DEAD");
  assert.equal(sick.deathCause, "ILLNESS");
  assert.equal(sick.health, 0);
  assert.equal(sick.hunger, 994);
  const illnessDeath = deathOf(illnessStep.events);
  assert.equal(illnessDeath.payload.cause, "ILLNESS");
  assert.equal(
    illnessDeath.event.summary,
    "Torkaeith died of illness in Meadow at age 0.",
  );
});

test("death checks prefer starvation, then thirst, then illness", () => {
  const both = world();
  byId(both, 1).hunger = 996;
  byId(both, 1).thirst = 993;
  byId(both, 1).health = 10;
  const bothStep = step(both);
  assert.equal(byId(both, 1).deathCause, "STARVATION");
  assert.equal(byId(both, 1).health, 0);
  assert.equal(bothStep.events.length, 1);

  const thirst = world();
  const dry = byId(thirst, 1);
  dry.thirst = 993;
  dry.health = 10;
  step(thirst);
  assert.equal(dry.deathCause, "THIRST");
  assert.equal(dry.health, 0);
  assert.equal(dry.thirst, 1000);
  assert.equal(dry.hunger, 304);

  const snapshot = world();
  const founder = byId(snapshot, 1);
  const species = snapshot.species.find((row) => row.id === founder.speciesId);
  assert.ok(species);
  const life = divRound(
    species.baseLifespanDays *
      snapshot.ruleset.ticksPerDay *
      (500 + founder.geneStrength),
    1000,
  );
  const elder = clone(snapshot);
  const dying = byId(elder, 1);
  dying.birthTick = 1 - life;
  dying.hunger = 1000;
  step(elder);
  assert.equal(dying.deathCause, "OLD_AGE");
  assert.equal(dying.hunger, 1000);
  assert.equal(dying.loneliness, 200);
  assert.equal(dying.health, 850);

  const younger = clone(snapshot);
  const living = byId(younger, 1);
  living.birthTick = 1 - (life - 1);
  step(younger);
  assert.equal(living.status, "ALIVE");
  assert.equal(living.deathCause, null);
  assert.equal(living.hunger, 304);
  assert.equal(living.loneliness, 202);
});

test("population and modifiers are fixed before deaths", () => {
  const crowded = world();
  const meadow = crowded.territories.find((row) => row.slug === "meadow");
  assert.ok(meadow);
  meadow.capacity = 1;
  step(crowded);
  assert.equal(byId(crowded, 2).discomfort, 107);

  const counted = world();
  const countedMeadow = counted.territories.find(
    (row) => row.slug === "meadow",
  );
  assert.ok(countedMeadow);
  countedMeadow.capacity = 1;
  byId(counted, 1).hunger = 996;
  step(counted);
  assert.equal(byId(counted, 1).status, "DEAD");
  assert.equal(byId(counted, 1).discomfort, 107);
  assert.equal(byId(counted, 2).discomfort, 107);

  const quiet = world();
  const quietMeadow = quiet.territories.find((row) => row.slug === "meadow");
  assert.ok(quietMeadow);
  quietMeadow.capacity = 1;
  for (const id of [2, 3, 4]) {
    const creature = byId(quiet, id);
    creature.status = "DEAD";
    creature.hunger = 300;
  }
  step(quiet);
  assert.equal(byId(quiet, 1).discomfort, 101);
  assert.equal(byId(quiet, 1).status, "ALIVE");
  assert.equal(byId(quiet, 2).hunger, 300);
  assert.equal(
    quiet.creatures.filter((creature) => creature.status === "DEAD").length,
    3,
  );

  const calmed = world();
  const ridge = calmed.territories.find((row) => row.slug === "ridge");
  assert.ok(ridge);
  calmed.modifiers.push({
    id: 1,
    worldId: 1,
    territoryId: ridge.id,
    kind: "DANGER",
    amount: -250,
    startTick: 1,
    endTick: 5,
    sourceInfluenceId: null,
  });
  step(calmed);
  assert.equal(byId(calmed, 9).discomfort, 101);
  assert.equal(byId(calmed, 9).unsafety, 148);

  const expired = world();
  const expiredRidge = expired.territories.find((row) => row.slug === "ridge");
  assert.ok(expiredRidge);
  expired.modifiers.push({
    id: 1,
    worldId: 1,
    territoryId: expiredRidge.id,
    kind: "DANGER",
    amount: -250,
    startTick: 0,
    endTick: 1,
    sourceInfluenceId: null,
  });
  step(expired);
  assert.equal(byId(expired, 9).discomfort, 103);

  const clamped = world();
  const clampedMeadow = clamped.territories.find(
    (row) => row.slug === "meadow",
  );
  assert.ok(clampedMeadow);
  byId(clamped, 1).unsafety = 1000;
  clamped.modifiers.push({
    id: 1,
    worldId: 1,
    territoryId: clampedMeadow.id,
    kind: "DANGER",
    amount: 1000,
    startTick: 1,
    endTick: 2,
    sourceInfluenceId: null,
  });
  step(clamped);
  assert.equal(byId(clamped, 1).discomfort, 103);
  assert.equal(byId(clamped, 1).unsafety, 996);
});

test("death records gestation, grief, and leaves the pair row", () => {
  const snapshot = world();
  const founder = byId(snapshot, 1);
  const child = byId(snapshot, 2);
  const paternal = byId(snapshot, 3);
  const both = byId(snapshot, 4);
  founder.hunger = 996;
  founder.currentGoal = "FIND_FOOD";
  founder.currentAction = "FORAGE";
  founder.actionTargetKind = "CREATURE";
  founder.actionTargetId = 2;
  founder.actionStartedTick = 0;
  founder.actionEndsTick = 9;
  founder.gestationEndTick = 80;
  founder.gestationSireId = 2;
  child.motherId = founder.id;
  paternal.fatherId = founder.id;
  both.motherId = founder.id;
  both.fatherId = founder.id;
  snapshot.relationships.push({
    id: 1,
    worldId: 1,
    creatureAId: 1,
    creatureBId: 2,
    score: 120,
    friendship: 40,
    romance: 0,
    trust: 0,
    cooperation: 0,
    avoidance: 0,
    conflict: 10,
    metTick: 0,
    lastInteractionTick: 0,
    interactionCount: 1,
  });

  const result = step(snapshot);
  const death = deathOf(result.events);
  assert.equal(death.payload.gestationLost, true);
  assert.equal(death.payload.cause, "STARVATION");
  assert.equal(founder.gestationEndTick, null);
  assert.equal(founder.gestationSireId, 2);
  assert.equal(founder.currentGoal, "FIND_FOOD");
  assert.equal(founder.currentAction, null);
  assert.equal(founder.actionTargetKind, "NONE");
  assert.equal(founder.actionTargetId, null);
  assert.equal(founder.actionStartedTick, null);
  assert.equal(founder.actionEndsTick, null);
  assert.equal(snapshot.relationships.length, 1);
  assert.equal(snapshot.relationships[0]?.score, 120);
  assert.equal(snapshot.relationships[0]?.conflict, 10);
  assert.deepEqual(
    snapshot.memories.map((memory) => memory.creatureId),
    [2, 3, 4],
  );
  assert.equal(snapshot.world.nextMemoryId, 4);
  const grief = snapshot.memories[0];
  assert.ok(grief);
  assert.equal(grief.kind, "PARENT_DEATH");
  assert.equal(grief.importance, 50);
  assert.equal(grief.emotionalValue, -900);
  assert.equal(grief.initialStrength, 600);
  assert.equal(grief.subjectCreatureId, 1);
  assert.equal(grief.territoryId, null);
  assert.equal(grief.tick, 1);
  assert.equal(grief.archived, false);
  assert.deepEqual(grief.payload, {
    tags: ["grief"],
    template: "parent_death.v1",
  });

  step(snapshot);
  assert.equal(snapshot.memories.length, 3);

  const later = world();
  byId(later, 1).hunger = 996;
  byId(later, 2).hunger = 996;
  byId(later, 2).motherId = 1;
  step(later);
  assert.deepEqual(
    later.memories.map((memory) => [
      memory.creatureId,
      memory.subjectCreatureId,
    ]),
    [[2, 1]],
  );
  assert.equal(byId(later, 2).status, "DEAD");

  const earlier = world();
  byId(earlier, 1).hunger = 996;
  byId(earlier, 1).motherId = 2;
  byId(earlier, 2).hunger = 996;
  step(earlier);
  assert.deepEqual(earlier.memories, []);
  assert.deepEqual(
    earlier.creatures
      .filter((creature) => creature.status === "DEAD")
      .map((creature) => creature.id),
    [1, 2],
  );

  const once = world();
  byId(once, 1).hunger = 996;
  byId(once, 2).motherId = 1;
  once.world.nextMemoryId = 2;
  once.memories.push({
    id: 1,
    worldId: 1,
    creatureId: 2,
    tick: 0,
    kind: "PARENT_DEATH",
    importance: 50,
    emotionalValue: -900,
    initialStrength: 600,
    subjectCreatureId: 1,
    territoryId: null,
    payload: { tags: ["grief"], template: "parent_death.v1" },
    archived: false,
  });
  step(once);
  assert.equal(once.memories.length, 1);
  assert.equal(once.world.nextMemoryId, 2);
});

test("influences stay outside this step; births need matching endTick", () => {
  const snapshot = world();
  const mother = byId(snapshot, 1);
  // End tick 1 does not match this step's tick 144, so no birth fires.
  mother.gestationEndTick = 1;
  mother.gestationSireId = 2;
  mother.currentAction = "FORAGE";
  mother.currentGoal = "FIND_FOOD";
  mother.actionStartedTick = 0;
  mother.actionEndsTick = 200;
  mother.hunger = 500;
  for (const creature of snapshot.creatures) {
    if (creature.id === mother.id) continue;
    creature.currentAction = "REST";
    creature.currentGoal = "SEEK_SHELTER";
    creature.actionStartedTick = 0;
    creature.actionEndsTick = 1_000_000;
  }
  snapshot.pendingInfluences.push({
    id: 1,
    worldId: 1,
    kind: "ENRICH_TERRITORY",
    issuedAtTick: 1,
    payload: { territoryId: 1 },
    applied: false,
  });
  // Recent interaction so the daily decay pass skips this pair.
  snapshot.relationships.push({
    id: 1,
    worldId: 1,
    creatureAId: 1,
    creatureBId: 2,
    score: 100,
    friendship: 50,
    romance: 0,
    trust: 0,
    cooperation: 0,
    avoidance: 0,
    conflict: 0,
    metTick: 0,
    lastInteractionTick: 100,
    interactionCount: 1,
  });
  snapshot.world.lastTick = 143;

  step(snapshot);

  assert.equal(snapshot.world.lastTick, 144);
  assert.equal(snapshot.creatures.length, 12);
  assert.equal(snapshot.world.nextCreatureId, 13);
  assert.equal(mother.gestationEndTick, 1);
  assert.equal(mother.currentAction, "FORAGE");
  assert.equal(mother.actionEndsTick, 200);
  assert.equal(mother.hunger, 504);
  assert.equal(mother.status, "ALIVE");
  assert.equal(snapshot.modifiers.length, 0);
  assert.equal(snapshot.pendingInfluences[0]?.applied, false);
  assert.equal(snapshot.relationships[0]?.friendship, 50);
  assert.equal(snapshot.relationships[0]?.score, 100);
  assert.equal(snapshot.world.nextEventId, 25);
});

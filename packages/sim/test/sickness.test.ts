/**
 * Sickness outbreaks, predators behind a hazard hit, injury news, and the
 * guard that keeps the last of a species alive through a famine.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Action,
  ActionTargetKind,
  CreatureStatus,
  DeathCause,
  Diet,
  EventKind,
  MemoryKind,
  ModifierKind,
} from "@boing-pets/contract";
import { applyHealthDrift } from "../src/kernel/needs";
import { dietOf } from "../src/kernel/biology";
import {
  HAZARD_RULES,
  PREDATOR_RULES,
  SICKNESS_RULES,
  activeSickness,
  applySickness,
  carnivoresByTerritory,
  createWorld,
  isSick,
  outbreakChance,
  pickPredator,
  startOutbreaks,
  step,
  type CreatureRow,
  type Sickness,
  type WorldEvent,
  type WorldSnapshot,
} from "../src/index";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Crowd one territory with copies of its first resident. */
function crowd(snapshot: WorldSnapshot, territoryId: number, count: number) {
  const model = snapshot.creatures.find(
    (row) => row.territoryId === territoryId,
  )!;
  for (let i = 0; i < count; i += 1) {
    const twin = clone(model);
    twin.id = snapshot.world.nextCreatureId;
    snapshot.world.nextCreatureId += 1;
    twin.name = `Twin ${i}`;
    snapshot.creatures.push(twin);
  }
}

test("only a crowded territory can fall sick", () => {
  assert.equal(outbreakChance(30, 60), 0);
  assert.equal(outbreakChance(3, 4), 0, "too few to sustain it");
  assert.equal(outbreakChance(10, 0), 0);
  const full = outbreakChance(60, 60);
  assert.ok(full > outbreakChance(45, 60));
  assert.ok(outbreakChance(600, 60) <= SICKNESS_RULES.chanceMaxPerMille);
});

test("an outbreak starts on a day boundary, is announced, and ends", () => {
  const { snapshot } = createWorld(1);
  const tpd = snapshot.ruleset.ticksPerDay;
  const territory = snapshot.territories[0]!;
  crowd(snapshot, territory.id, territory.capacity);

  const midday: WorldEvent[] = [];
  startOutbreaks(snapshot, tpd + 1, midday);
  assert.equal(midday.length, 0, "rolls once a day only");

  let started: WorldEvent | undefined;
  let tick = 0;
  for (let day = 1; day < 2000 && !started; day += 1) {
    tick = day * tpd;
    const events: WorldEvent[] = [];
    startOutbreaks(snapshot, tick, events);
    started = events.find((event) => event.territoryId === territory.id);
  }
  assert.ok(started, "a full territory falls sick sooner or later");
  assert.equal(started.kind, EventKind.OUTBREAK);
  assert.ok(started.summary.includes(territory.name), started.summary);

  const row = snapshot.modifiers.find(
    (modifier) =>
      modifier.kind === ModifierKind.SICKNESS &&
      modifier.territoryId === territory.id,
  )!;
  assert.equal(row.startTick, tick);
  assert.equal(row.endTick, tick + SICKNESS_RULES.durationDays * tpd);
  assert.ok(activeSickness(snapshot, tick).has(territory.id));
  assert.ok(activeSickness(snapshot, row.endTick - 1).has(territory.id));
  assert.equal(activeSickness(snapshot, row.endTick).has(territory.id), false);

  // No second outbreak on top of a running one.
  const again: WorldEvent[] = [];
  for (let t = tick; t < row.endTick; t += tpd) {
    startOutbreaks(snapshot, t, again);
  }
  assert.equal(
    again.filter((event) => event.territoryId === territory.id).length,
    0,
  );
});

test("some catch it, the same ones every tick; nursing young do not", () => {
  const { snapshot } = createWorld(1);
  const sickness: Sickness = { id: 9, startTick: 144, endTick: 432, drain: 2 };
  const rows = snapshot.creatures.map((row) => ({
    ...row,
    currentAction: null,
  }));
  const sick = rows.filter((row) => isSick(row, sickness, 1));
  assert.ok(sick.length > 0 && sick.length < rows.length, `${sick.length}`);
  for (const row of sick) assert.equal(isSick(row, sickness, 1), true);
  assert.equal(isSick(rows[0]!, undefined, 1), false);
  const young = { ...sick[0]!, currentAction: Action.NURSE };
  assert.equal(isSick(young, sickness, 1), false);
  const dead = { ...sick[0]!, status: CreatureStatus.DEAD };
  assert.equal(isSick(dead, sickness, 1), false);
});

test("sickness drains health, stops natural healing, and spares the last few", () => {
  const { snapshot } = createWorld(1);
  const rules = snapshot.ruleset;
  const sickness: Sickness = { id: 1, startTick: 0, endTick: 288, drain: 2 };
  const creature = snapshot.creatures[0]!;
  creature.hunger = 0;
  creature.thirst = 0;
  creature.fatigue = 0;
  creature.currentAction = null;

  creature.health = 800;
  applyHealthDrift(creature, rules, true);
  assert.equal(creature.health, 800, "a sick creature does not mend");
  applySickness(creature, sickness, 99);
  assert.equal(creature.health, 798);
  creature.currentAction = Action.REST;
  applySickness(creature, sickness, 99);
  assert.equal(creature.health, 797, "rest halves the drain");

  creature.currentAction = null;
  creature.health = 1;
  applySickness(creature, sickness, 99);
  assert.equal(creature.health, 0);

  creature.health = HAZARD_RULES.spareHealth + 1;
  applySickness(creature, sickness, HAZARD_RULES.endangeredAtMost);
  assert.equal(creature.health, HAZARD_RULES.spareHealth);
  applySickness(creature, sickness, HAZARD_RULES.endangeredAtMost);
  assert.equal(creature.health, HAZARD_RULES.spareHealth);
});

test("a creature dies of illness in an outbreak when nothing helps it", () => {
  const { snapshot } = createWorld(1);
  const tick = snapshot.world.lastTick + 1;
  const territory = snapshot.territories[0]!;
  crowd(snapshot, territory.id, 12);
  snapshot.modifiers.push({
    id: snapshot.world.nextModifierId,
    worldId: snapshot.world.id,
    territoryId: territory.id,
    kind: ModifierKind.SICKNESS,
    amount: SICKNESS_RULES.drainPerTick,
    startTick: tick,
    endTick: tick + 288,
    sourceInfluenceId: null,
  });
  snapshot.world.nextModifierId += 1;
  const sickness = activeSickness(snapshot, tick).get(territory.id)!;
  const victim = snapshot.creatures.find(
    (row) =>
      row.territoryId === territory.id &&
      isSick({ ...row, currentAction: null }, sickness, snapshot.world.seed),
  )!;
  victim.health = 3;
  victim.currentAction = null;
  // Keep hazards out of it: the death must be the sickness's.
  for (const row of snapshot.territories) row.danger = 0;

  let cause: string | null = null;
  for (let i = 0; i < 10 && cause == null; i += 1) {
    victim.hunger = 0;
    victim.thirst = 0;
    const { events } = step(snapshot);
    const death = events.find(
      (event) => event.kind === EventKind.DEATH && event.actorId === victim.id,
    );
    if (death) cause = (death.payload as { cause: string }).cause;
  }
  assert.equal(cause, DeathCause.ILLNESS);
});

test("famine weakens the last of a kind but does not kill them", () => {
  const { snapshot } = createWorld(1);
  const rules = snapshot.ruleset;
  const creature = snapshot.creatures[0]!;
  creature.hunger = 990;
  creature.health = 30;
  applyHealthDrift(creature, rules, false, true);
  assert.equal(creature.health, 30, "already below the floor: no lower");
  creature.health = HAZARD_RULES.spareHealth + 5;
  applyHealthDrift(creature, rules, false, true);
  assert.equal(creature.health, HAZARD_RULES.spareHealth);
  creature.health = HAZARD_RULES.spareHealth + 5;
  applyHealthDrift(creature, rules, false, false);
  assert.ok(creature.health < HAZARD_RULES.spareHealth);
});

/** A meat-eater and something weaker of another species, side by side. */
function predatorAndPrey(snapshot: WorldSnapshot): {
  predator: CreatureRow;
  prey: CreatureRow;
} {
  const speciesById = new Map(snapshot.species.map((row) => [row.id, row]));
  const predator = snapshot.creatures.find(
    (row) =>
      dietOf(speciesById.get(row.speciesId), row.speciesId) === Diet.CARNIVORE,
  )!;
  const prey = snapshot.creatures.find(
    (row) =>
      row.speciesId !== predator.speciesId &&
      dietOf(speciesById.get(row.speciesId), row.speciesId) !== Diet.CARNIVORE,
  )!;
  prey.territoryId = predator.territoryId;
  predator.geneStrength = 900;
  prey.geneStrength = 200;
  predator.currentAction = null;
  prey.currentAction = null;
  return { predator, prey };
}

test("a predator must be a stronger meat-eater of another species, at hand", () => {
  const { snapshot } = createWorld(1);
  const { predator, prey } = predatorAndPrey(snapshot);
  const speciesById = new Map(snapshot.species.map((row) => [row.id, row]));
  const pick = (victim: CreatureRow, tick: number) =>
    pickPredator(
      victim,
      carnivoresByTerritory(snapshot.creatures, speciesById).get(
        victim.territoryId,
      ),
      1,
      tick,
    );

  let hits = 0;
  for (let tick = 1; tick <= 400; tick += 1) {
    const found = pick(prey, tick);
    if (found == null) continue;
    hits += 1;
    assert.notEqual(found.speciesId, prey.speciesId);
    assert.ok(found.geneStrength >= prey.geneStrength);
    assert.equal(found.territoryId, prey.territoryId);
  }
  // About `attackPercent` of hits, with slack for the roll.
  assert.ok(
    hits > 400 * (PREDATOR_RULES.attackPercent / 100 - 0.15) &&
      hits < 400 * (PREDATOR_RULES.attackPercent / 100 + 0.15),
    `${hits}`,
  );
  assert.deepEqual(pick(prey, 7), pick(prey, 7), "same roll, same predator");

  // Nobody preys on its own kind, and a weakling preys on no one.
  for (let tick = 1; tick <= 200; tick += 1) {
    const found = pick(predator, tick);
    assert.ok(found == null || found.speciesId !== predator.speciesId);
  }
  for (const row of snapshot.creatures) {
    if (row.territoryId === prey.territoryId) row.geneStrength = 100;
  }
  prey.geneStrength = 900;
  for (let tick = 1; tick <= 200; tick += 1) {
    assert.equal(pick(prey, tick), null);
  }
});

/** Hold a creature in place, idle, fed and watered, for the next tick. */
function pin(row: CreatureRow, territoryId: number): void {
  row.status = CreatureStatus.ALIVE;
  row.deathTick = null;
  row.deathCause = null;
  row.territoryId = territoryId;
  row.currentAction = null;
  row.actionTargetKind = ActionTargetKind.NONE;
  row.actionTargetId = null;
  row.actionStartedTick = null;
  row.actionEndsTick = null;
  row.hunger = 0;
  row.thirst = 0;
  row.fatigue = 0;
}

/** A world of one predator, its prey and `extra` more of the prey's kind. */
function huntingGround(extra: number) {
  const { snapshot } = createWorld(1);
  const { predator, prey } = predatorAndPrey(snapshot);
  const herd: CreatureRow[] = [];
  for (let i = 0; i < extra; i += 1) {
    const twin = clone(prey);
    twin.id = snapshot.world.nextCreatureId;
    snapshot.world.nextCreatureId += 1;
    twin.name = `Twin ${i}`;
    herd.push(twin);
  }
  snapshot.creatures = [predator, prey, ...herd];
  for (const row of snapshot.territories) row.danger = 1000;
  const home = predator.territoryId;
  return { snapshot, predator, prey, herd, home };
}

test("a mauling feeds the predator, is remembered, and makes the news", () => {
  const { snapshot, predator, prey, home } = huntingGround(0);
  let injury: WorldEvent | undefined;
  for (let i = 0; i < 20_000 && !injury; i += 1) {
    pin(prey, home);
    pin(predator, home);
    prey.health = HAZARD_RULES.woundedBelow + 100;
    predator.health = 1000;
    predator.hunger = 600;
    const { events } = step(snapshot);
    injury = events.find(
      (event) =>
        event.kind === EventKind.INJURY &&
        event.actorId === prey.id &&
        event.subjectId === predator.id,
    );
  }
  assert.ok(injury, "the predator strikes sooner or later");
  assert.ok(injury.summary.includes(predator.name), injury.summary);
  assert.ok(injury.summary.includes(prey.name), injury.summary);
  assert.ok(prey.health < HAZARD_RULES.woundedBelow);
  assert.ok(predator.hunger < 600, "the predator is fed");
  const memory = snapshot.memories.find(
    (row) =>
      row.creatureId === prey.id &&
      row.kind === MemoryKind.THREAT &&
      row.subjectCreatureId === predator.id,
  );
  assert.ok(memory, "the victim remembers its attacker");
});

test("a kill names the killer in the death notice", () => {
  // Enough of the prey's kind that it is not spared as the last few.
  const { snapshot, predator, prey, herd, home } = huntingGround(6);
  let killed: WorldEvent | undefined;
  for (let i = 0; i < 40_000 && !killed; i += 1) {
    // Whoever the land took last tick is put back.
    for (const row of [predator, prey, ...herd]) {
      pin(row, home);
      row.health = 1000;
    }
    prey.health = 100;
    const { events } = step(snapshot);
    killed = events.find(
      (event) =>
        event.kind === EventKind.DEATH &&
        event.actorId === prey.id &&
        event.subjectId === predator.id,
    );
  }
  assert.ok(killed, "the predator makes a kill sooner or later");
  assert.equal((killed.payload as { killerId?: number }).killerId, predator.id);
  assert.ok(
    killed.summary.includes(`was killed by ${predator.name}`),
    killed.summary,
  );
});

/**
 * Hazards: danger hurts, wounds heal slowly, the last of a kind are spared,
 * and a birth survives the father's death.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Action,
  CreatureStatus,
  DeathCause,
  EventKind,
  Gender,
} from "@boing-pets/contract";
import { applyHealthDrift } from "../src/kernel/needs";
import { LATE_FATHER_NAME } from "../src/kernel/birth";
import {
  HAZARD_RULES,
  applyHazard,
  createWorld,
  hazardChance,
  recoverPerTick,
  step,
  type CreatureRow,
} from "../src/index";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** First tick at which this creature would be hit at the given danger. */
function hitTick(creature: CreatureRow, seed: number, danger: number): number {
  for (let tick = 1; tick < 200_000; tick += 1) {
    const probe = clone(creature);
    if (applyHazard(probe, seed, tick, danger, 99) !== "none") return tick;
  }
  throw new Error("no hit found");
}

test("safe ground never hurts; danger and shelter set the odds", () => {
  assert.equal(hazardChance(HAZARD_RULES.dangerFloor, false), 0);
  assert.equal(hazardChance(0, false), 0);
  const ridge = hazardChance(700, false);
  assert.ok(ridge > hazardChance(350, false));
  assert.equal(
    hazardChance(700, true),
    Math.floor(ridge / HAZARD_RULES.restingDivisor),
  );

  const { snapshot } = createWorld(1);
  const creature = snapshot.creatures[0]!;
  for (let tick = 1; tick <= 2000; tick += 1) {
    assert.equal(applyHazard(creature, 1, tick, 100, 99), "none");
  }
  assert.equal(creature.health, snapshot.creatures[0]!.health);
});

test("a hit costs health and frightens; the same roll always lands the same", () => {
  const { snapshot } = createWorld(1);
  const base = snapshot.creatures[0]!;
  base.health = 1000;
  base.unsafety = 0;
  base.currentAction = null;
  const tick = hitTick(base, 1, 700);

  const a = clone(base);
  const b = clone(base);
  assert.equal(applyHazard(a, 1, tick, 700, 99), "hurt");
  assert.equal(applyHazard(b, 1, tick, 700, 99), "hurt");
  assert.deepEqual(a, b);
  const lost = 1000 - a.health;
  assert.ok(
    lost >= HAZARD_RULES.damageMin && lost <= HAZARD_RULES.damageMax,
    `lost ${lost}`,
  );
  assert.equal(a.unsafety, HAZARD_RULES.unsafetyHit);

  // Nursing young are sheltered by the mother.
  const young = clone(base);
  young.currentAction = Action.NURSE;
  assert.equal(applyHazard(young, 1, tick, 700, 99), "none");
  assert.equal(young.health, 1000);
});

test("a hit can kill, but never the last few of a species", () => {
  const { snapshot } = createWorld(1);
  const base = snapshot.creatures[0]!;
  base.health = 100;
  base.currentAction = null;
  const tick = hitTick(base, 1, 700);

  const common = clone(base);
  assert.equal(applyHazard(common, 1, tick, 700, 12), "killed");
  assert.equal(common.health, 0);

  const rare = clone(base);
  assert.equal(
    applyHazard(rare, 1, tick, 700, HAZARD_RULES.endangeredAtMost),
    "hurt",
  );
  assert.equal(rare.health, HAZARD_RULES.spareHealth);
});

test("a wounded creature heals slowly until it is back on its feet", () => {
  const { snapshot } = createWorld(1);
  const rules = snapshot.ruleset;
  assert.equal(
    recoverPerTick(HAZARD_RULES.woundedBelow - 1, rules),
    HAZARD_RULES.woundedRecoverPerTick,
  );
  assert.equal(
    recoverPerTick(HAZARD_RULES.woundedBelow, rules),
    rules.healthRecoverPerTick,
  );

  const creature = snapshot.creatures[0]!;
  creature.hunger = 0;
  creature.thirst = 0;
  creature.fatigue = 0;
  creature.health = 300;
  applyHealthDrift(creature, rules);
  assert.equal(creature.health, 300 + HAZARD_RULES.woundedRecoverPerTick);
  creature.health = 600;
  applyHealthDrift(creature, rules);
  assert.equal(creature.health, 600 + rules.healthRecoverPerTick);
});

test("a death by hazard is recorded as an injury", () => {
  const { snapshot } = createWorld(1);
  // A common species on dangerous ground, one blow from death, every tick.
  const victim = snapshot.creatures[0]!;
  for (let i = 0; i < 6; i += 1) {
    const twin = clone(victim);
    twin.id = snapshot.world.nextCreatureId;
    snapshot.world.nextCreatureId += 1;
    twin.name = `Twin ${i}`;
    snapshot.creatures.push(twin);
  }
  for (const territory of snapshot.territories) territory.danger = 1000;
  let cause: string | null = null;
  for (let i = 0; i < 20_000 && cause == null; i += 1) {
    victim.health = Math.min(victim.health, 100);
    victim.hunger = 0;
    victim.thirst = 0;
    const { events } = step(snapshot);
    const death = events.find(
      (event) => event.kind === EventKind.DEATH && event.actorId === victim.id,
    );
    if (death) cause = (death.payload as { cause: string }).cause;
  }
  assert.equal(cause, DeathCause.INJURY);
  assert.equal(victim.status, CreatureStatus.DEAD);
});

test("a child is still born when its father died and left the snapshot", () => {
  const run = (prune: boolean) => {
    const { snapshot } = createWorld(1);
    const mother = snapshot.creatures.find(
      (row) => row.gender === Gender.FEMALE,
    )!;
    const father = snapshot.creatures.find(
      (row) => row.gender === Gender.MALE && row.speciesId === mother.speciesId,
    )!;
    const due = snapshot.world.lastTick + 1;
    mother.gestationSireId = father.id;
    mother.gestationEndTick = due;
    father.status = CreatureStatus.DEAD;
    father.deathTick = snapshot.world.lastTick;
    father.deathCause = DeathCause.INJURY;
    if (prune) {
      snapshot.creatures = snapshot.creatures.filter(
        (row) => row.id !== father.id,
      );
    }
    const before = snapshot.world.nextCreatureId;
    const { events } = step(snapshot);
    const birth = events.find((event) => event.kind === EventKind.BIRTH);
    assert.ok(birth, "the birth happens");
    const child = snapshot.creatures.find((row) => row.id === before)!;
    assert.equal(child.motherId, mother.id);
    assert.equal(child.fatherId, father.id);
    assert.ok(birth.summary.includes(LATE_FATHER_NAME), birth.summary);
    return child;
  };
  // Whether the dead father's row is still around must not change the child.
  assert.deepEqual(run(true), run(false));
});

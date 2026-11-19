/**
 * GUARD resolution: offspring unsafety/trust, rescue when health < 300.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Action,
  ActionTargetKind,
  CreatureStatus,
  Goal,
  MemoryKind,
} from "@boing-pets/contract";
import { resolveGuard } from "../src/ai/actions";
import {
  canonicalHash,
  createWorld,
  findRelationship,
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

function pinGuard(
  actor: CreatureRow,
  targetId: number,
  endsTick: number,
): void {
  actor.currentGoal = Goal.PROTECT_OFFSPRING;
  actor.currentAction = Action.GUARD;
  actor.actionTargetKind = ActionTargetKind.CREATURE;
  actor.actionTargetId = targetId;
  actor.actionStartedTick = endsTick - 1;
  actor.actionEndsTick = endsTick;
}

test("GUARD lowers offspring unsafety and adds parent-child trust", () => {
  const snapshot = world();
  const mother = byId(snapshot, 1);
  const child = byId(snapshot, 2);
  // Treat #2 as mother's juvenile offspring in the same territory.
  child.motherId = mother.id;
  child.fatherId = null;
  child.birthTick = 0;
  child.territoryId = mother.territoryId;
  child.unsafety = 200;

  pinGuard(mother, child.id, 1);
  mother.fatigue = 100;
  resolveGuard(snapshot, mother, 1);

  assert.equal(child.unsafety, 170);
  const pair = findRelationship(snapshot.relationships, mother.id, child.id);
  assert.ok(pair);
  assert.equal(pair.trust, 5);
  assert.equal(mother.fatigue, 102);
  assert.equal(mother.currentAction, null);
  assert.equal(mother.actionEndsTick, null);
});

test("GUARD rescues the lowest-health co-located creature; offspring wins ties", () => {
  const snapshot = world();
  const mother = byId(snapshot, 1);
  const child = byId(snapshot, 2);
  const stranger = byId(snapshot, 3);
  child.motherId = mother.id;
  child.fatherId = null;
  child.birthTick = 0;
  child.territoryId = mother.territoryId;
  stranger.territoryId = mother.territoryId;
  child.health = 250;
  stranger.health = 250;
  child.unsafety = 400;
  stranger.unsafety = 400;
  mother.fatigue = 50;

  pinGuard(mother, child.id, 1);
  resolveGuard(snapshot, mother, 1);

  assert.equal(child.health, 290);
  assert.equal(child.unsafety, 270); // −30 guard then −100 rescue
  assert.equal(stranger.health, 250);
  assert.equal(mother.fatigue, 70);
  const rescues = snapshot.memories.filter(
    (memory) => memory.kind === MemoryKind.RESCUE,
  );
  assert.equal(rescues.length, 2);
  const pair = findRelationship(snapshot.relationships, mother.id, child.id);
  assert.ok(pair);
  assert.ok(pair.score >= 80);
  assert.ok(pair.trust >= 60);
});

test("GUARD through step is deterministic and writes RESCUE memories", () => {
  function prepare(): WorldSnapshot {
    const snapshot = world();
    const mother = byId(snapshot, 1);
    const child = byId(snapshot, 2);
    child.motherId = mother.id;
    child.fatherId = null;
    child.birthTick = 0;
    child.territoryId = mother.territoryId;
    child.health = 200;
    child.unsafety = 500;
    child.status = CreatureStatus.ALIVE;
    for (const creature of snapshot.creatures) {
      if (creature.id === mother.id) continue;
      creature.currentGoal = Goal.SEEK_SHELTER;
      creature.currentAction = Action.REST;
      creature.actionTargetKind = ActionTargetKind.NONE;
      creature.actionTargetId = null;
      creature.actionStartedTick = 0;
      creature.actionEndsTick = 1_000_000;
    }
    pinGuard(mother, child.id, 1);
    return snapshot;
  }

  const a = prepare();
  const b = clone(a);
  step(a);
  step(b);
  assert.equal(canonicalHash(a), canonicalHash(b));
  const rescues = a.memories.filter(
    (memory) => memory.kind === MemoryKind.RESCUE,
  );
  assert.equal(rescues.length, 2);
  // Rescue +40, then live health recover may add a further +5 in the same tick.
  assert.ok(byId(a, 2).health >= 240);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { Action, ActionTargetKind, Goal } from "@boing-pets/contract";
import {
  applyContestDelta,
  applyRelationshipDecay,
  applySocializeDelta,
  createParentChildRelationship,
  createRelationship,
  createWorld,
  ensureRelationship,
  findRelationship,
  RULESET_V1,
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

test("contest at tick 10 sets conflict +40; decay waits until tick 288", () => {
  const snapshot = world();
  const actor = byId(snapshot, 1);
  const rival = byId(snapshot, 2);
  const rules = snapshot.ruleset;

  freezeLiving(snapshot, 1_000_000);
  const pair = createRelationship(snapshot, actor.id, rival.id, 0);
  pair.score = 0;
  pair.friendship = 20;
  pair.conflict = 0;
  pair.lastInteractionTick = 0;
  pair.interactionCount = 0;

  actor.currentGoal = Goal.FIND_FOOD;
  actor.currentAction = Action.CONTEST;
  actor.actionTargetKind = ActionTargetKind.CREATURE;
  actor.actionTargetId = rival.id;
  actor.actionStartedTick = 7;
  actor.actionEndsTick = 10;
  actor.geneStrength = 500;
  actor.traitAggression = 600;
  rival.geneStrength = 400;
  rival.traitAggression = 500;

  snapshot.world.lastTick = 9;
  step(snapshot);

  assert.equal(snapshot.world.lastTick, 10);
  assert.equal(pair.conflict, 40);
  assert.equal(pair.score, -20);
  assert.equal(pair.friendship, 10);
  assert.equal(pair.avoidance, 15);
  assert.equal(pair.lastInteractionTick, 10);
  assert.equal(pair.interactionCount, 1);
  assert.notEqual(actor.currentAction, Action.CONTEST);
  assert.ok(
    snapshot.memories.some(
      (memory) =>
        memory.kind === "CONFLICT" &&
        memory.creatureId === actor.id &&
        memory.subjectCreatureId === rival.id,
    ),
  );

  freezeLiving(snapshot, 1_000_000);
  snapshot.world.lastTick = 143;
  step(snapshot);
  assert.equal(snapshot.world.lastTick, 144);
  // Only 134 ticks of quiet since the contest — decay pass does nothing.
  assert.equal(pair.conflict, 40);
  assert.equal(pair.score, -20);
  assert.equal(pair.friendship, 10);
  assert.equal(pair.lastInteractionTick, 10);

  freezeLiving(snapshot, 1_000_000);
  snapshot.world.lastTick = 287;
  step(snapshot);
  assert.equal(snapshot.world.lastTick, 288);
  assert.equal(pair.conflict, 40 - rules.conflictDecay);
  assert.equal(pair.score, -20 - divRound(-20, rules.scoreDecayDen));
  assert.equal(pair.score, -18);
  assert.equal(pair.friendship, 10 - rules.friendshipDecay);
  assert.equal(pair.lastInteractionTick, 10);
  assert.equal(pair.interactionCount, 1);
});

test("APPROACH creates a zero pair then socialize deltas", () => {
  const snapshot = world();
  const actor = byId(snapshot, 1);
  const target = byId(snapshot, 2);
  freezeLiving(snapshot, 1_000_000);

  assert.equal(findRelationship(snapshot.relationships, 1, 2), null);

  actor.traitAggression = 100;
  target.traitSociability = 500;
  actor.currentGoal = Goal.SOCIALIZE;
  actor.currentAction = Action.APPROACH;
  actor.actionTargetKind = ActionTargetKind.CREATURE;
  actor.actionTargetId = target.id;
  actor.actionStartedTick = 1;
  actor.actionEndsTick = 4;
  actor.loneliness = 400;
  target.loneliness = 300;

  snapshot.world.lastTick = 3;
  step(snapshot);

  const pair = findRelationship(snapshot.relationships, 1, 2);
  assert.ok(pair);
  assert.equal(pair.metTick, 4);
  assert.equal(pair.lastInteractionTick, 4);
  assert.equal(pair.interactionCount, 1);
  assert.equal(pair.score, RULESET_V1.socializeScore);
  assert.equal(
    pair.friendship,
    RULESET_V1.socializeFriendshipBase +
      Math.floor(
        actor.traitSociability / RULESET_V1.socializeFriendshipPerSociability,
      ),
  );
  assert.equal(pair.trust, RULESET_V1.socializeTrust);
  assert.equal(pair.cooperation, RULESET_V1.socializeCooperation);
  // Actor was on APPROACH during drift (no +2). Target was REST and drifts after relief.
  assert.equal(actor.loneliness, 400 - RULESET_V1.socializeLonelinessActor);
  assert.equal(
    target.loneliness,
    300 - RULESET_V1.socializeLonelinessTarget + RULESET_V1.lonelinessPerTick,
  );
  assert.equal(
    snapshot.memories.filter((memory) => memory.kind === "CONVERSATION").length,
    2,
  );
});

test("parent-child create and ensureRelationship stay ordered", () => {
  const snapshot = world();
  const child = createParentChildRelationship(snapshot, 5, 2, 12);
  assert.equal(child.creatureAId, 2);
  assert.equal(child.creatureBId, 5);
  assert.equal(child.score, 400);
  assert.equal(child.friendship, 200);
  assert.equal(child.trust, 300);
  assert.equal(child.cooperation, 100);
  assert.equal(child.romance, 0);
  assert.equal(child.conflict, 0);

  const again = ensureRelationship(snapshot, 5, 2, 99);
  assert.equal(again, child);
  assert.equal(again.metTick, 12);
});

test("passive decay moves score toward zero including negatives", () => {
  const row = {
    id: 1,
    worldId: 1,
    creatureAId: 1,
    creatureBId: 2,
    score: -100,
    friendship: 12,
    romance: 20,
    trust: 7,
    cooperation: 9,
    avoidance: 6,
    conflict: 11,
    metTick: 0,
    lastInteractionTick: 0,
    interactionCount: 3,
  };
  applyRelationshipDecay(row, RULESET_V1);
  assert.equal(row.friendship, 7);
  assert.equal(row.romance, 12);
  assert.equal(row.conflict, 8);
  assert.equal(row.avoidance, 4);
  assert.equal(row.trust, 5);
  assert.equal(row.cooperation, 5);
  assert.equal(row.score, -100 - divRound(-100, 10));
  assert.equal(row.score, -90);
  assert.equal(row.interactionCount, 3);
  assert.equal(row.lastInteractionTick, 0);

  const positive = {
    ...row,
    score: 100,
    friendship: 0,
    romance: 0,
    trust: 0,
    cooperation: 0,
    avoidance: 0,
    conflict: 0,
  };
  applyRelationshipDecay(positive, RULESET_V1);
  assert.equal(positive.score, 90);
  assert.equal(positive.friendship, 0);
});

test("contest delta clamps friendship with max(0, friendship - 10)", () => {
  const snapshot = world();
  const row = createRelationship(snapshot, 1, 2, 1);
  row.friendship = 4;
  applyContestDelta(row, 2);
  assert.equal(row.friendship, 0);
  assert.equal(row.conflict, 40);
  assert.equal(row.score, -20);
  assert.equal(row.interactionCount, 1);
});

test("socialize friendship uses actor sociability from the ruleset", () => {
  const snapshot = world();
  const row = createRelationship(snapshot, 1, 2, 1);
  applySocializeDelta(row, 199, 2, RULESET_V1);
  assert.equal(
    row.friendship,
    RULESET_V1.socializeFriendshipBase + Math.floor(199 / 50),
  );
});

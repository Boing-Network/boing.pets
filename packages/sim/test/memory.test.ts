import assert from "node:assert/strict";
import { test } from "node:test";
import { Goal, MemoryKind, MemoryTag } from "@boing-pets/contract";
import { scoreGoal } from "../src/ai/utility";
import {
  RULESET_V1,
  createWorld,
  initialMemoryStrength,
  isMemoryThrottled,
  memoryResidue,
  memoryStrength,
  type MemoryRow,
  type WorldSnapshot,
} from "../src/index";

function world(): WorldSnapshot {
  return createWorld(1).snapshot;
}

function memory(
  partial: Partial<MemoryRow> & Pick<MemoryRow, "kind" | "importance">,
): MemoryRow {
  const importance = partial.importance;
  return {
    id: partial.id ?? 1,
    worldId: partial.worldId ?? 1,
    creatureId: partial.creatureId ?? 1,
    tick: partial.tick ?? 0,
    kind: partial.kind,
    importance,
    emotionalValue: partial.emotionalValue ?? 0,
    initialStrength:
      partial.initialStrength ?? initialMemoryStrength(importance, RULESET_V1),
    subjectCreatureId: partial.subjectCreatureId ?? null,
    territoryId: partial.territoryId ?? null,
    payload: partial.payload ?? { tags: [], template: "test.v1" },
    archived: partial.archived ?? false,
  };
}

test("PARENT_DEATH at 12 major half-lives keeps its residue; CONVERSATION is 0", () => {
  const elapsed = 12 * RULESET_V1.halfLifeMajorTicks;
  assert.equal(elapsed, 518_400);

  const grief = memory({
    kind: MemoryKind.PARENT_DEATH,
    importance: 50,
    emotionalValue: -900,
    payload: { tags: [MemoryTag.GRIEF], template: "parent_death.v1" },
  });
  const chat = memory({
    id: 2,
    kind: MemoryKind.CONVERSATION,
    importance: 1,
    emotionalValue: 200,
    payload: { tags: [], template: "conversation.v1" },
  });

  assert.equal(grief.initialStrength, 600);
  assert.equal(chat.initialStrength, 12);
  assert.equal(memoryResidue(50, RULESET_V1), 400);
  assert.equal(memoryResidue(1, RULESET_V1), 0);

  assert.equal(memoryStrength(grief, elapsed, RULESET_V1), 400);
  assert.equal(memoryStrength(chat, elapsed, RULESET_V1), 0);

  assert.equal(memoryStrength(grief, grief.tick + elapsed, RULESET_V1), 400);
  assert.equal(memoryStrength(chat, chat.tick + elapsed, RULESET_V1), 0);
});

test("utility Memory term uses decayed strength for PROTECT_OFFSPRING", () => {
  const snapshot = world();
  const elapsed = 12 * snapshot.ruleset.halfLifeMajorTicks;
  const creature = snapshot.creatures.find((row) => row.id === 2);
  assert.ok(creature);
  const child = snapshot.creatures.find((row) => row.id === 3);
  assert.ok(child);
  child.motherId = creature.id;
  child.birthTick = elapsed;
  child.territoryId = creature.territoryId;

  snapshot.memories.push(
    memory({
      id: 1,
      creatureId: creature.id,
      tick: 0,
      kind: MemoryKind.PARENT_DEATH,
      importance: 50,
      emotionalValue: -900,
      subjectCreatureId: 1,
      payload: { tags: [MemoryTag.GRIEF], template: "parent_death.v1" },
    }),
    memory({
      id: 2,
      creatureId: creature.id,
      tick: 0,
      kind: MemoryKind.CONVERSATION,
      importance: 1,
      emotionalValue: 200,
      subjectCreatureId: child.id,
      payload: { tags: [], template: "conversation.v1" },
    }),
  );

  const protect = scoreGoal(
    snapshot,
    creature,
    elapsed,
    Goal.PROTECT_OFFSPRING,
  );
  assert.equal(protect.memory, 400);

  const socialize = scoreGoal(snapshot, creature, elapsed, Goal.SOCIALIZE);
  assert.equal(socialize.memory, 0);
});

test("windowed and once throttles skip matching inserts", () => {
  const snapshot = world();
  snapshot.memories.push(
    memory({
      id: 1,
      creatureId: 1,
      tick: 100,
      kind: MemoryKind.CONVERSATION,
      importance: 1,
      subjectCreatureId: 2,
    }),
    memory({
      id: 2,
      creatureId: 1,
      tick: 50,
      kind: MemoryKind.DISCOVERY,
      importance: 10,
      territoryId: 2,
      payload: { tags: [MemoryTag.DISCOVERY], template: "discovery.v1" },
    }),
    memory({
      id: 3,
      creatureId: 1,
      tick: 10,
      kind: MemoryKind.CONFLICT,
      importance: 8,
      subjectCreatureId: 3,
    }),
  );

  assert.equal(
    isMemoryThrottled(snapshot, {
      creatureId: 1,
      kind: MemoryKind.CONVERSATION,
      tick: 100 + RULESET_V1.memoryThrottleTicks,
      subjectCreatureId: 2,
    }),
    true,
  );
  assert.equal(
    isMemoryThrottled(snapshot, {
      creatureId: 1,
      kind: MemoryKind.CONVERSATION,
      tick: 100 + RULESET_V1.memoryThrottleTicks + 1,
      subjectCreatureId: 2,
    }),
    false,
  );
  assert.equal(
    isMemoryThrottled(snapshot, {
      creatureId: 1,
      kind: MemoryKind.CONVERSATION,
      tick: 200,
      subjectCreatureId: 4,
    }),
    false,
  );
  assert.equal(
    isMemoryThrottled(snapshot, {
      creatureId: 1,
      kind: MemoryKind.DISCOVERY,
      tick: 10_000,
      territoryId: 2,
    }),
    true,
  );
  assert.equal(
    isMemoryThrottled(snapshot, {
      creatureId: 1,
      kind: MemoryKind.DISCOVERY,
      tick: 10_000,
      territoryId: 3,
    }),
    false,
  );
  assert.equal(
    isMemoryThrottled(snapshot, {
      creatureId: 1,
      kind: MemoryKind.CONFLICT,
      tick: 10 + RULESET_V1.conflictMemoryThrottleTicks,
      subjectCreatureId: 3,
    }),
    true,
  );
  assert.equal(
    isMemoryThrottled(snapshot, {
      creatureId: 1,
      kind: MemoryKind.CONFLICT,
      tick: 10 + RULESET_V1.conflictMemoryThrottleTicks + 1,
      subjectCreatureId: 3,
    }),
    false,
  );
  assert.equal(
    isMemoryThrottled(snapshot, {
      creatureId: 1,
      kind: MemoryKind.MATE,
      tick: 200,
      subjectCreatureId: 2,
    }),
    false,
  );
});

test("decay bins stay integer and fresh memories keep initial strength", () => {
  const fresh = memory({
    kind: MemoryKind.GIFT,
    importance: 5,
    tick: 40,
  });
  assert.equal(memoryStrength(fresh, 40, RULESET_V1), fresh.initialStrength);
  assert.equal(memoryStrength(fresh, 39, RULESET_V1), fresh.initialStrength);

  const mid = memoryStrength(
    fresh,
    40 + RULESET_V1.halfLifeMinorTicks,
    RULESET_V1,
  );
  assert.ok(Number.isInteger(mid));
  assert.ok(mid < fresh.initialStrength);
  assert.ok(mid > 0);
});

/**
 * M16: inspection queries read durable rows, including dead parents.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ActionTargetKind,
  CreatureStatus,
  DeathCause,
  Gender,
  Goal,
  MemoryKind,
  RelationshipLabel,
} from "@boing-pets/contract";
import { createWorld, type CreatureRow, type MemoryRow } from "@boing-pets/sim";
import {
  handleInspectionQuery,
  queryCreatureFromTables,
  queryFamilyFromTables,
} from "../src/ipc/queries";
import { worldgenTables } from "../src/persist/save";
import { relationshipLabels } from "../src/view/world-view";

function cloneCreature(
  base: CreatureRow,
  patch: Partial<CreatureRow>,
): CreatureRow {
  return {
    ...base,
    ...patch,
    genesExtra: { ...base.genesExtra },
    personalityExtra: { ...base.personalityExtra },
  };
}

test("query.creature returns needs, goal, genes, traits, memories, and pair labels", () => {
  const { snapshot, events } = createWorld(1);
  const tables = worldgenTables(snapshot, events);
  const living = tables.creatures.find(
    (row) => row.status === CreatureStatus.ALIVE,
  );
  assert.ok(living);

  const peer = tables.creatures.find(
    (row) => row.id !== living.id && row.status === CreatureStatus.ALIVE,
  );
  assert.ok(peer);

  const [a, b] =
    living.id < peer.id ? [living.id, peer.id] : [peer.id, living.id];
  tables.relationships.push({
    id: tables.world.nextRelationshipId,
    worldId: tables.world.id,
    creatureAId: a,
    creatureBId: b,
    score: 400,
    friendship: 700,
    romance: 100,
    trust: 200,
    cooperation: 100,
    avoidance: 0,
    conflict: 0,
    metTick: 0,
    lastInteractionTick: 0,
    interactionCount: 3,
  });
  tables.world.nextRelationshipId += 1;

  const memory: MemoryRow = {
    id: tables.world.nextMemoryId,
    worldId: tables.world.id,
    creatureId: living.id,
    tick: 0,
    kind: MemoryKind.DISCOVERY,
    importance: 10,
    emotionalValue: 300,
    initialStrength: 120,
    subjectCreatureId: null,
    territoryId: living.territoryId,
    payload: { tags: ["discovery"], template: "discovery.v1" },
    archived: false,
  };
  tables.memories.push(memory);
  tables.world.nextMemoryId += 1;

  living.hunger = 420;
  living.currentGoal = Goal.FIND_FOOD;
  living.geneStrength = 610;
  living.traitCuriosity = 730;

  const view = queryCreatureFromTables(tables, living.id);
  assert.ok(view);
  assert.equal(view.needs.hunger, 420);
  assert.equal(view.currentGoal, Goal.FIND_FOOD);
  assert.equal(view.genes.strength, 610);
  assert.equal(view.personality.curiosity, 730);
  assert.equal(view.memories.length, 1);
  assert.equal(view.memories[0]?.kind, MemoryKind.DISCOVERY);
  assert.ok(
    view.relationships.some((rel) =>
      rel.labels.includes(RelationshipLabel.FRIEND),
    ),
  );
  assert.deepEqual(relationshipLabels(tables.relationships[0]!), [
    RelationshipLabel.FRIEND,
  ]);
});

test("query.family includes a dead parent among ancestors", () => {
  const { snapshot, events } = createWorld(1);
  const tables = worldgenTables(snapshot, events);
  const motherTemplate = tables.creatures[0]!;
  const fatherTemplate = tables.creatures[1]!;

  const deadMotherId = tables.world.nextCreatureId;
  tables.world.nextCreatureId += 1;
  const childId = tables.world.nextCreatureId;
  tables.world.nextCreatureId += 1;

  const deadMother = cloneCreature(motherTemplate, {
    id: deadMotherId,
    name: "Ash",
    status: CreatureStatus.DEAD,
    deathTick: 10,
    deathCause: DeathCause.OLD_AGE,
    motherId: null,
    fatherId: null,
    generation: 0,
    lineageId: motherTemplate.lineageId,
    currentGoal: Goal.IDLE,
    currentAction: null,
    actionTargetKind: ActionTargetKind.NONE,
    actionTargetId: null,
    actionStartedTick: null,
    actionEndsTick: null,
  });

  const child = cloneCreature(motherTemplate, {
    id: childId,
    name: "Bri-2",
    status: CreatureStatus.ALIVE,
    birthTick: 20,
    deathTick: null,
    deathCause: null,
    motherId: deadMotherId,
    fatherId: fatherTemplate.id,
    generation: 1,
    lineageId: deadMother.lineageId,
    gender: Gender.FEMALE,
    currentGoal: Goal.FIND_FOOD,
    hunger: 500,
  });

  tables.creatures.push(deadMother, child);

  // Hot snapshot would drop the dead mother; durable tables still hold her.
  const hotAlive = tables.creatures.filter(
    (row) => row.status === CreatureStatus.ALIVE,
  );
  assert.equal(
    hotAlive.some((row) => row.id === deadMotherId),
    false,
  );

  const family = queryFamilyFromTables(tables, childId);
  assert.ok(family);
  const deadAncestor = family.ancestors.find(
    (row) => row.creature.id === deadMotherId,
  );
  assert.ok(deadAncestor);
  assert.equal(deadAncestor.depth, 1);
  assert.equal(deadAncestor.creature.status, CreatureStatus.DEAD);
  assert.equal(deadAncestor.creature.name, "Ash");

  const fatherAncestor = family.ancestors.find(
    (row) => row.creature.id === fatherTemplate.id,
  );
  assert.ok(fatherAncestor);
  assert.equal(fatherAncestor.depth, 1);
});

test("handleInspectionQuery dispatches creature and family messages", () => {
  const { snapshot, events } = createWorld(1);
  const tables = worldgenTables(snapshot, events);
  const id = tables.creatures[0]!.id;

  const creature = handleInspectionQuery(tables, {
    message: "query.creature",
    body: { creatureId: id },
  });
  assert.equal(creature.message, "query.creature");
  assert.equal(creature.body.id, id);

  const family = handleInspectionQuery(tables, {
    message: "query.family",
    body: { creatureId: id },
  });
  assert.equal(family.message, "query.family");
  assert.ok(Array.isArray(family.body.ancestors));
});

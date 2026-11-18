import assert from "node:assert/strict";
import { test } from "node:test";
import { CreatureStatus, Goal, RelationshipLabel } from "@boing-pets/contract";
import { bindIpcToStores } from "../src/api/bind";
import { createMemoryIpc } from "../src/api/memory-ipc";
import {
  FIXTURE_DEAD_MOTHER_ID,
  FIXTURE_FAMILY_BY_CREATURE_ID,
  FIXTURE_INSPECTABLE_CHILD_ID,
  FIXTURE_WORLD_VIEW,
} from "../src/demo/fixture-world";
import { topMemories } from "../src/hud/topMemories";
import { useUiStore } from "../src/state/uiStore";
import { useWorldViewStore } from "../src/state/worldViewStore";

test("selecting Quill exposes needs, goal, genes, traits, memories, and pair labels", () => {
  useWorldViewStore.setState({ view: null, clock: null, lastCatchup: null });
  useUiStore.setState({ selectedCreatureId: null });

  const { client, host } = createMemoryIpc();
  const unbind = bindIpcToStores(client);
  host.emit({ message: "world.snapshot", body: FIXTURE_WORLD_VIEW });

  useUiStore.getState().selectCreature(FIXTURE_INSPECTABLE_CHILD_ID);
  const selected = useWorldViewStore
    .getState()
    .view?.creatures.find(
      (creature) => creature.id === FIXTURE_INSPECTABLE_CHILD_ID,
    );
  assert.ok(selected);
  assert.equal(selected.currentGoal, Goal.FIND_FOOD);
  assert.equal(selected.needs.hunger, 420);
  assert.equal(selected.genes.curiosity, 620);
  assert.equal(selected.personality.loyalty, 580);
  assert.ok(selected.memories.length >= 2);
  assert.ok(
    selected.relationships.some((rel) =>
      rel.labels.includes(RelationshipLabel.FRIEND),
    ),
  );
  assert.equal(selected.family.motherId, FIXTURE_DEAD_MOTHER_ID);

  const tops = topMemories(selected.memories, 2);
  assert.equal(tops.length, 2);
  assert.ok(tops[0]!.strength >= tops[1]!.strength);

  unbind();
  client.dispose();
});

test("query.family for Quill includes the dead mother", async () => {
  const { client, host } = createMemoryIpc();
  host.setQueryHandler((message) => {
    if (message.message !== "query.family") {
      throw new Error(message.message);
    }
    const body = FIXTURE_FAMILY_BY_CREATURE_ID[message.body.creatureId] ?? {
      children: [],
      siblings: [],
      ancestors: [],
      descendants: [],
    };
    return { message: "query.family", body };
  });

  const result = await client.query({
    message: "query.family",
    body: { creatureId: FIXTURE_INSPECTABLE_CHILD_ID },
  });
  assert.equal(result.message, "query.family");
  const dead = result.body.ancestors.find(
    (row) => row.creature.id === FIXTURE_DEAD_MOTHER_ID,
  );
  assert.ok(dead);
  assert.equal(dead.creature.status, CreatureStatus.DEAD);
  assert.equal(dead.creature.name, "Ash");
  assert.equal(dead.depth, 1);

  client.dispose();
});

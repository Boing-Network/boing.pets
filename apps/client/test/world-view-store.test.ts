import assert from "node:assert/strict";
import { test } from "node:test";
import { CreatureStatus } from "@boing-pets/contract";
import { FIXTURE_WORLD_VIEW } from "../src/demo/fixture-world";
import { useWorldViewStore } from "../src/state/worldViewStore";

function resetStore() {
  useWorldViewStore.setState({
    view: null,
    clock: null,
    lastCatchup: null,
  });
}

test("world.snapshot caches three territories and living tokens", () => {
  resetStore();
  useWorldViewStore.getState().applyHostMessage({
    message: "world.snapshot",
    body: FIXTURE_WORLD_VIEW,
  });
  const view = useWorldViewStore.getState().view;
  assert.ok(view);
  assert.equal(view.territories.length, 3);
  assert.deepEqual(view.territories.map((t) => t.slug).sort(), [
    "meadow",
    "ridge",
    "thicket",
  ]);
  const living = useWorldViewStore.getState().livingCreatures();
  assert.equal(living.length, 12);
  assert.ok(living.every((c) => c.status === CreatureStatus.ALIVE));
});

test("world.patch replaces rows without inventing needs", () => {
  resetStore();
  useWorldViewStore.getState().setSnapshot(FIXTURE_WORLD_VIEW);
  const first = FIXTURE_WORLD_VIEW.creatures[0];
  assert.ok(first);
  const patched = {
    ...first,
    needs: { ...first.needs, hunger: 900 },
    name: "Renamed",
  };
  useWorldViewStore.getState().applyPatch({
    tick: 4,
    creatures: [patched],
    relationships: [],
    events: [],
    territories: [
      {
        ...FIXTURE_WORLD_VIEW.territories[0]!,
        food: 850,
        population: 4,
      },
    ],
  });
  const view = useWorldViewStore.getState().view;
  assert.ok(view);
  assert.equal(view.world.lastTick, 4);
  assert.equal(view.creatures.find((c) => c.id === first.id)?.name, "Renamed");
  assert.equal(
    view.creatures.find((c) => c.id === first.id)?.needs.hunger,
    900,
  );
  assert.equal(view.territories.find((t) => t.id === 1)?.food, 850);
});

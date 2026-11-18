import assert from "node:assert/strict";
import { test } from "node:test";
import { bindIpcToStores } from "../src/api/bind";
import { createMemoryIpc } from "../src/api/memory-ipc";
import { FIXTURE_WORLD_VIEW } from "../src/demo/fixture-world";
import { useUiStore } from "../src/state/uiStore";
import { useWorldViewStore } from "../src/state/worldViewStore";

test("memory IPC delivers host snapshot into the world view store", () => {
  useWorldViewStore.setState({ view: null, clock: null, lastCatchup: null });
  const { client, host } = createMemoryIpc();
  const unbind = bindIpcToStores(client);

  host.emit({ message: "world.snapshot", body: FIXTURE_WORLD_VIEW });
  host.emit({
    message: "world.clock",
    body: { tick: 0, paused: true, scale: 4, clockAt: 0 },
  });

  assert.equal(useWorldViewStore.getState().view?.territories.length, 3);
  assert.equal(useWorldViewStore.getState().clock?.scale, 4);
  assert.equal(useUiStore.getState().paused, true);
  assert.equal(useUiStore.getState().scale, 4);

  unbind();
  client.dispose();
});

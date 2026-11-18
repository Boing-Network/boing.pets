import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { bindIpcToStores } from "./api/bind";
import {
  createElectronIpc,
  isElectronBridgeAvailable,
} from "./api/electron-ipc";
import { createMemoryIpc } from "./api/memory-ipc";
import {
  FIXTURE_FAMILY_BY_CREATURE_ID,
  FIXTURE_WORLD_VIEW,
} from "./demo/fixture-world";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("missing #root");
}

function bootDemoIpc() {
  const { client, host } = createMemoryIpc();
  bindIpcToStores(client);

  host.setQueryHandler((message) => {
    if (message.message === "query.family") {
      const body = FIXTURE_FAMILY_BY_CREATURE_ID[message.body.creatureId] ?? {
        children: [],
        siblings: [],
        ancestors: [],
        descendants: [],
      };
      return { message: "query.family", body };
    }
    if (message.message === "query.creature") {
      const body = FIXTURE_WORLD_VIEW.creatures.find(
        (creature) => creature.id === message.body.creatureId,
      );
      if (!body) {
        throw new Error(`creature ${message.body.creatureId} not found`);
      }
      return { message: "query.creature", body };
    }
    throw new Error(`unsupported demo query: ${message.message}`);
  });

  // Browser demo host: fixture snapshot until Electron packaging is used.
  host.emit({ message: "world.snapshot", body: FIXTURE_WORLD_VIEW });
  host.emit({
    message: "world.clock",
    body: {
      tick: FIXTURE_WORLD_VIEW.world.lastTick,
      paused: false,
      scale: 1,
      clockAt: FIXTURE_WORLD_VIEW.world.clockAtMs,
    },
  });

  return client;
}

const ipc = isElectronBridgeAvailable()
  ? (() => {
      const client = createElectronIpc();
      bindIpcToStores(client);
      return client;
    })()
  : bootDemoIpc();

createRoot(rootElement).render(
  <StrictMode>
    <App ipc={ipc} />
  </StrictMode>,
);

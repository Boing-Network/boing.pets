import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { bindIpcToStores } from "./api/bind";
import { createMemoryIpc } from "./api/memory-ipc";
import { FIXTURE_WORLD_VIEW } from "./demo/fixture-world";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("missing #root");
}

const { client, host } = createMemoryIpc();
bindIpcToStores(client);

// Demo host: push a WorldView the same way Electron will after M18.
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

createRoot(rootElement).render(
  <StrictMode>
    <App ipc={client} />
  </StrictMode>,
);

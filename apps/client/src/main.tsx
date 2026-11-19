import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { bindIpcToStores } from "./api/bind";
import { createBrowserHostIpc } from "./api/browser-host-ipc";
import {
  createElectronIpc,
  isElectronBridgeAvailable,
} from "./api/electron-ipc";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("missing #root");
}

function bootBrowserHostIpc() {
  const client = createBrowserHostIpc({ seed: 1, scale: 64 });
  bindIpcToStores(client);
  return client;
}

const ipc = isElectronBridgeAvailable()
  ? (() => {
      const client = createElectronIpc();
      bindIpcToStores(client);
      return client;
    })()
  : bootBrowserHostIpc();

createRoot(rootElement).render(
  <StrictMode>
    <App ipc={ipc} />
  </StrictMode>,
);

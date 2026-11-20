import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { bindIpcToStores } from "./api/bind";
import { createBrowserHostIpc } from "./api/browser-host-ipc";
import {
  createElectronIpc,
  isElectronBridgeAvailable,
} from "./api/electron-ipc";
import { createWsHostIpc, sharedWorldFromLocation } from "./api/ws-host-ipc";
import { useWorldViewStore } from "./state/worldViewStore";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("missing #root");
}

function bootBrowserHostIpc() {
  const client = createBrowserHostIpc({ seed: 1, scale: 64 });
  bindIpcToStores(client);
  return client;
}

/** `?mp=ws://127.0.0.1:8787` joins a shared world (see README). */
function bootSharedWorldIpc(shared: {
  url: string;
  ownerKey?: string;
  name?: string;
}) {
  const client = createWsHostIpc({
    ...shared,
    onStatus: (connection) => useWorldViewStore.setState({ connection }),
    onWelcome: () => {
      // The owner key is now inside the signed session token; keep it out of
      // the address bar, history, and screenshots.
      const url = new URL(window.location.href);
      if (url.searchParams.has("owner")) {
        url.searchParams.delete("owner");
        window.history.replaceState(null, "", url);
      }
    },
  });
  bindIpcToStores(client);
  return client;
}

const shared = sharedWorldFromLocation(
  window.location.search,
  import.meta.env.VITE_LIVING_PETS_MP_URL as string | undefined,
);

const ipc = isElectronBridgeAvailable()
  ? (() => {
      const client = createElectronIpc();
      bindIpcToStores(client);
      return client;
    })()
  : shared != null
    ? bootSharedWorldIpc(shared)
    : bootBrowserHostIpc();

createRoot(rootElement).render(
  <StrictMode>
    <App ipc={ipc} />
  </StrictMode>,
);

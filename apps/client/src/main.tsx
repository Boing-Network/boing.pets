import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { bindIpcToStores } from "./api/bind";
import { createBrowserHostIpc } from "./api/browser-host-ipc";
import {
  createElectronIpc,
  isElectronBridgeAvailable,
} from "./api/electron-ipc";
import { createWsHostIpc, sharedWorldFromLocation } from "./api/ws-host-ipc";
import { useSharedWorldStore } from "./state/sharedWorldStore";
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
    onPlayers: (players) => useSharedWorldStore.setState({ players }),
    onError: (code, message) => {
      if (code === "wallet_rejected") {
        useSharedWorldStore.getState().setSigningIn(false, message);
      }
    },
    onWelcome: (welcome) => {
      useSharedWorldStore.setState({
        sessionId: welcome.sessionId,
        wallet: welcome.wallet ?? null,
        signingIn: false,
      });
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
  useSharedWorldStore.setState({ controls: client });
  return client;
}

/** Dev-only art review stage (`?bestiary`); never boots a world. */
const Bestiary = lazy(() =>
  import("./dev/Bestiary").then((module) => ({ default: module.Bestiary })),
);

if (new URLSearchParams(window.location.search).has("bestiary")) {
  createRoot(rootElement).render(
    <StrictMode>
      <Suspense fallback={null}>
        <Bestiary />
      </Suspense>
    </StrictMode>,
  );
} else {
  bootGame(rootElement);
}

function bootGame(rootElement: HTMLElement) {
  const shared = sharedWorldFromLocation(
    window.location.search,
    import.meta.env.VITE_LIVING_PETS_MP_URL as string | undefined,
  );

  const desktop = isElectronBridgeAvailable();
  const ipc = desktop
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
      <App ipc={ipc} siteNav={!desktop} />
    </StrictMode>,
  );
}

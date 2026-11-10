import { hex32, isSignatureAction, type Action } from "../core";
import {
  api,
  app,
  notice,
  pending,
  clearSocialSession,
  type Challenge,
  type Provider,
} from "./appRuntime";
import {
  clearWalletSession,
  ensurePreferredProvider,
  getInjectedBoingProvider,
  hydrateCachedWallet,
  loadCachedProviderKind,
  providerKindOf,
  readBoingAccounts,
  tryRestoreWalletSession,
  type RestoreKind,
} from "../wallet/session";

type RefreshFn = () => Promise<void>;
type ControlsFn = () => void;

let refreshFn: RefreshFn = async () => {};
let controlsFn: ControlsFn = () => {};

export function setCareHooks(hooks: {
  refresh: RefreshFn;
  controls: ControlsFn;
}) {
  refreshFn = hooks.refresh;
  controlsFn = hooks.controls;
}

async function refresh() {
  await refreshFn();
}
function controls() {
  controlsFn();
}

export async function run(task: () => Promise<void>) {
  if (app.busy) return;
  app.busy = true;
  controls();
  try {
    await task();
  } catch (e) {
    notice(
      e instanceof Error ? e.message : "Something went wrong. Please retry.",
      true,
    );
  } finally {
    app.busy = false;
    controls();
  }
}
export async function assertWallet() {
  if (!app.owner) throw new Error("Connect Boing Express first");
  // Prefer the extension (wait for late inject). Interactive so an empty
  // silent-accounts check prompts window.boing, never the web wallet tab.
  const live = await ensurePreferredProvider({
    interactive: true,
    expectedOwner: app.owner,
  });
  bindWallet(live, "live");
  if (live.providerKind === "extension") {
    try {
      const chain = await live.provider.request({
        method: "boing_chainId",
        params: [],
      });
      if (Number(chain) !== 6913 && Number(chain) !== 0x1b01)
        throw new Error(
          "Switch Express to Boing testnet 6913 before continuing",
        );
    } catch (e) {
      if (e instanceof Error && /6913/.test(e.message)) throw e;
    }
  }
}
export async function confirmPending() {
  const p = pending();
  if (!p || p.owner !== app.owner)
    throw new Error("No pending transaction for this wallet");
  notice("Checking transaction inclusion…");
  await api("/api/confirm", { id: p.id, tx_hash: p.tx_hash });
  localStorage.removeItem("boing-pets-pending");
  await refresh();
  notice("Confirmed. Your buddy felt that little bounce!");
}
export async function act(action: Action) {
  await assertWallet();
  if (pending()?.owner === app.owner)
    throw new Error(
      "Confirm your pending transaction first; do not pay twice.",
    );
  const c = await api<Challenge>("/api/challenge", {
    owner: app.owner,
    action,
  });
  if (isSignatureAction(action)) {
    const labels: Record<string, string> = {
      checkin: "daily hello",
      play: "play session",
      groom: "grooming",
    };
    notice(
      `Approve your ${labels[action] || action} in Express. This is a signature, not a transaction.`,
    );
    const signature = await app.provider!.request({
      method: "boing_signMessage",
      params: [c.message, app.owner],
    });
    const confirmed = await api<{
      ok?: boolean;
      streak_milestone?: { streak: number; sparkles: number } | null;
    }>("/api/confirm", { id: c.id, signature });
    await refresh();
    let msg =
      action === "checkin"
        ? "Hello sent. A little love goes a long way."
        : action === "play"
          ? "Playtime logged. Energy up!"
          : "All fresh. Hygiene restored.";
    if (confirmed.streak_milestone?.sparkles) {
      msg += ` Streak day ${confirmed.streak_milestone.streak}: +${confirmed.streak_milestone.sparkles} Sparkles!`;
    }
    notice(msg);
    return;
  }
  notice(
    "Approve the tiny self-transfer in Express. Only the network fee leaves your wallet.",
  );
  const result = (await app.provider!.request({
    method: "boing_sendTransaction",
    params: [c.transaction],
  })) as { tx_id?: string; tx_hash?: string } | string;
  const hash = hex32(
    typeof result === "string" ? result : result.tx_id || result.tx_hash,
  );
  localStorage.setItem(
    "boing-pets-pending",
    JSON.stringify({ id: c.id, owner: c.owner, tx_hash: hash }),
  );
  notice(
    "Transaction submitted. Confirming inclusion… If it is still pending, use Confirm pending transaction.",
  );
  await confirmPending();
}
function onAccountsChanged() {
  // Re-read silently. An empty/failed probe is not a disconnect.
  void (async () => {
    if (!app.provider) return;
    const accounts = await readBoingAccounts(app.provider);
    if (!accounts[0]) {
      app.walletKind = app.owner ? "cached" : null;
      controls();
      return;
    }
    const next = hex32(accounts[0]);
    if (next !== app.owner)
      bindWallet({ provider: app.provider, owner: next }, "live");
    else app.walletKind = "live";
    controls();
  })();
}

function onChainChanged() {
  // Don't treat a chain flip as a logout.
  controls();
}

export function bindWallet(
  session: {
    provider: Provider;
    owner: string;
    providerKind?: "extension" | "web";
  },
  kind: RestoreKind | "live" = "live",
) {
  app.provider?.removeListener?.("accountsChanged", onAccountsChanged);
  app.provider?.removeListener?.("chainChanged", onChainChanged);
  app.provider = session.provider;
  app.owner = session.owner;
  app.walletKind = kind === "cached" ? "cached" : "live";
  app.providerKind =
    "providerKind" in session && session.providerKind
      ? session.providerKind
      : providerKindOf(session.provider);
  app.provider.on?.("accountsChanged", onAccountsChanged);
  app.provider.on?.("chainChanged", onChainChanged);
}
export function disconnect() {
  app.provider?.removeListener?.("accountsChanged", onAccountsChanged);
  app.provider?.removeListener?.("chainChanged", onChainChanged);
  clearWalletSession(app.provider);
  clearSocialSession(app.owner || undefined);
  app.owner = "";
  app.walletKind = null;
  app.providerKind = null;
  app.mine = null;
  app.provider = null;
  controls();
  void refresh().catch(() => notice("Pasture unavailable", true));
}
/** Apply the cached owner synchronously so the header never flashes Connect. */
export function hydrateAppWallet(): boolean {
  const owner = hydrateCachedWallet();
  if (!owner) return false;
  app.owner = owner;
  app.walletKind = "cached";
  app.providerKind = loadCachedProviderKind();
  const injected = getInjectedBoingProvider();
  if (injected)
    bindWallet(
      { provider: injected, owner, providerKind: "extension" },
      "cached",
    );
  return true;
}

export async function attachRestoredSession() {
  const session = await tryRestoreWalletSession(undefined, {
    // Only wait for late injection when this device last used the extension.
    waitMs: loadCachedProviderKind() === "extension" ? undefined : 0,
  });
  if (!session) {
    // Extension was used but has not injected; keep the cached address visible.
    if (app.owner) {
      controls();
      return true;
    }
    return false;
  }
  bindWallet(session, session.kind);
  if (session.kind === "live" && session.providerKind === "extension") {
    try {
      const chain = await session.provider.request({
        method: "boing_chainId",
        params: [],
      });
      if (Number(chain) !== 6913 && Number(chain) !== 0x1b01)
        throw new Error("wrong chain");
    } catch {
      app.walletKind = "cached";
    }
  }
  controls();
  return true;
}

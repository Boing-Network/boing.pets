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
import { clearWalletSession, tryRestoreWalletSession } from "../wallet/session";

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
  if (!app.provider || !app.owner)
    throw new Error("Connect Boing Express first");
  if (!app.provider.isBoingWeb) {
    const chain = await app.provider.request({
      method: "boing_chainId",
      params: [],
    });
    if (Number(chain) !== 6913)
      throw new Error("Switch Express to Boing testnet 6913 before continuing");
    const accounts = (await app.provider.request({
      method: "boing_accounts",
      params: [],
    })) as string[];
    if (!accounts?.[0] || hex32(accounts[0]) !== app.owner)
      throw new Error("Wallet account changed. Disconnect and reconnect.");
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
export function bindWallet(session: { provider: Provider; owner: string }) {
  app.provider?.removeListener?.("accountsChanged", disconnect);
  app.provider?.removeListener?.("chainChanged", disconnect);
  app.provider = session.provider;
  app.owner = session.owner;
  app.provider.on?.("accountsChanged", disconnect);
  app.provider.on?.("chainChanged", disconnect);
}
export function disconnect() {
  app.provider?.removeListener?.("accountsChanged", disconnect);
  app.provider?.removeListener?.("chainChanged", disconnect);
  clearWalletSession(app.provider);
  clearSocialSession(app.owner || undefined);
  app.owner = "";
  app.mine = null;
  app.provider = null;
  controls();
  void refresh().catch(() => notice("Pasture unavailable", true));
}
export async function attachRestoredSession() {
  const session = await tryRestoreWalletSession();
  if (!session) return false;
  bindWallet(session);
  try {
    await assertWallet();
  } catch {
    clearWalletSession(app.provider);
    app.owner = "";
    app.provider = null;
    return false;
  }
  return true;
}

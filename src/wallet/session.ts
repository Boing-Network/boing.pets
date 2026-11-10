import { createBoingWebWalletProvider } from "@boing-network/boing-sdk";
import { hex32 } from "../core";

export interface BoingProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?: (event: string, handler: () => void) => void;
  removeListener?: (event: string, handler: () => void) => void;
  isBoingWeb?: boolean;
  disconnect?: () => void;
}

const CHAIN_HEX = "0x1b01";
const WALLET_CACHE_KEY = "boing-pets-wallet-v1";

export interface CachedWalletSession {
  owner: string;
  connected_at: number;
}

export function loadCachedWalletOwner(): string | null {
  try {
    const raw = browserLocalStorage()?.getItem(WALLET_CACHE_KEY) ?? null;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedWalletSession;
    if (!parsed?.owner || typeof parsed.owner !== "string") return null;
    return hex32(parsed.owner);
  } catch {
    return null;
  }
}

export function saveCachedWalletOwner(owner: string) {
  try {
    const row: CachedWalletSession = {
      owner: hex32(owner),
      connected_at: Date.now(),
    };
    browserLocalStorage()?.setItem(WALLET_CACHE_KEY, JSON.stringify(row));
  } catch {
    /* private mode / quota */
  }
}

export function clearCachedWalletOwner() {
  try {
    browserLocalStorage()?.removeItem(WALLET_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

function browserLocalStorage(): Storage | null {
  try {
    const g = globalThis as typeof globalThis & { localStorage?: Storage };
    return g.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Prefer injected Express; otherwise the web-wallet popup provider. */
export function getBoingProvider(): BoingProvider {
  const g = globalThis as typeof globalThis & {
    boing?: BoingProvider;
    window?: { boing?: BoingProvider };
  };
  const injected = g.boing || g.window?.boing;
  if (injected) return injected;
  return createBoingWebWalletProvider({
    chainId: CHAIN_HEX,
    mode: "popup",
  }) as BoingProvider;
}

/** Silent account read — no popup. */
export async function readBoingAccounts(
  provider: BoingProvider,
): Promise<string[]> {
  try {
    const accounts = (await provider.request({
      method: "boing_accounts",
      params: [],
    })) as string[];
    return Array.isArray(accounts) ? accounts : [];
  } catch {
    return [];
  }
}

export type RestoreKind = "live" | "cached";

/**
 * Restore a previously authorized Express session without prompting.
 * 1) Prefer silent boing_accounts from the provider.
 * 2) If empty, fall back to the localStorage owner so the header stays
 *    connected across full page navigations; signing re-auths lazily.
 */
export async function tryRestoreWalletSession(
  provider: BoingProvider = getBoingProvider(),
): Promise<{
  provider: BoingProvider;
  owner: string;
  kind: RestoreKind;
} | null> {
  const cached = loadCachedWalletOwner();
  const accounts = await readBoingAccounts(provider);
  const live = accounts[0] ? hex32(accounts[0]) : null;

  if (live) {
    if (!provider.isBoingWeb) {
      try {
        const chain = await provider.request({
          method: "boing_chainId",
          params: [],
        });
        if (Number(chain) !== 6913) return null;
      } catch {
        return null;
      }
    }
    saveCachedWalletOwner(live);
    return { provider, owner: live, kind: "live" };
  }

  if (cached) {
    // Optimistic restore: UI stays connected; signatures may prompt once.
    return { provider, owner: cached, kind: "cached" };
  }
  return null;
}

/** Interactive connect (may open Express). Call from a click handler. */
export async function requestWalletSession(
  provider: BoingProvider = getBoingProvider(),
): Promise<{ provider: BoingProvider; owner: string }> {
  const accounts = (await provider.request({
    method: "boing_requestAccounts",
    params: [],
  })) as string[];
  if (!accounts?.[0]) throw new Error("No Express account returned");
  const owner = hex32(accounts[0]);
  if (!provider.isBoingWeb) {
    const chain = await provider.request({
      method: "boing_chainId",
      params: [],
    });
    if (Number(chain) !== 6913)
      throw new Error("Switch Express to Boing testnet 6913 before continuing");
    const again = await readBoingAccounts(provider);
    if (!again[0] || hex32(again[0]) !== owner)
      throw new Error("Wallet account changed. Disconnect and reconnect.");
  }
  saveCachedWalletOwner(owner);
  return { provider, owner };
}

/**
 * Ensure the provider still authorizes app.owner before a signature/tx.
 * Uses silent accounts first; only prompts if the session was cache-only.
 */
export async function ensureLiveWalletSession(
  provider: BoingProvider,
  expectedOwner: string,
): Promise<{ provider: BoingProvider; owner: string }> {
  const want = hex32(expectedOwner);
  const accounts = await readBoingAccounts(provider);
  if (accounts[0] && hex32(accounts[0]) === want) {
    saveCachedWalletOwner(want);
    return { provider, owner: want };
  }
  const fresh = await requestWalletSession(provider);
  if (fresh.owner !== want) {
    // User picked a different account — treat as the new session.
    saveCachedWalletOwner(fresh.owner);
  }
  return fresh;
}

export function clearWalletSession(provider: BoingProvider | null) {
  clearCachedWalletOwner();
  try {
    provider?.disconnect?.();
  } catch {
    /* ignore */
  }
}

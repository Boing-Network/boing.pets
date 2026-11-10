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
/** Must match @boing-network/boing-sdk createBoingWebWalletProvider. */
export const BOING_WEB_ACCOUNTS_KEY = "boing_web_accounts";
export const EXTENSION_INJECT_WAIT_MS = 2000;
export const BOING_INITIALIZED_EVENT = "boing#initialized";
export const EIP6963_ANNOUNCE_EVENT = "eip6963:announceProvider";
export const EIP6963_REQUEST_EVENT = "eip6963:requestProvider";

export type WalletProviderKind = "extension" | "web";

export interface CachedWalletSession {
  owner: string;
  connected_at: number;
  provider?: WalletProviderKind;
}

function browserLocalStorage(): Storage | null {
  try {
    const g = globalThis as typeof globalThis & { localStorage?: Storage };
    return g.localStorage ?? null;
  } catch {
    return null;
  }
}

function browserSessionStorage(): Storage | null {
  try {
    const g = globalThis as typeof globalThis & { sessionStorage?: Storage };
    return g.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function loadCachedWalletSession(): CachedWalletSession | null {
  try {
    const raw = browserLocalStorage()?.getItem(WALLET_CACHE_KEY) ?? null;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedWalletSession;
    if (!parsed?.owner || typeof parsed.owner !== "string") return null;
    const provider =
      parsed.provider === "extension" || parsed.provider === "web"
        ? parsed.provider
        : undefined;
    return {
      owner: hex32(parsed.owner),
      connected_at:
        typeof parsed.connected_at === "number" ? parsed.connected_at : 0,
      provider,
    };
  } catch {
    return null;
  }
}

export function loadCachedWalletOwner(): string | null {
  return loadCachedWalletSession()?.owner ?? null;
}

export function loadCachedProviderKind(): WalletProviderKind | null {
  return loadCachedWalletSession()?.provider ?? null;
}

export function saveCachedWalletOwner(
  owner: string,
  kind?: WalletProviderKind,
) {
  try {
    const prev = loadCachedWalletSession();
    const row: CachedWalletSession = {
      owner: hex32(owner),
      connected_at: Date.now(),
      provider: kind ?? prev?.provider,
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
  try {
    browserSessionStorage()?.removeItem(BOING_WEB_ACCOUNTS_KEY);
  } catch {
    /* ignore */
  }
}

export function formatWalletLabel(owner: string): string {
  const hex = owner.startsWith("0x") ? owner : "0x" + owner;
  return `${hex.slice(0, 8)}…${hex.slice(-4)}`;
}

/**
 * Seed the web-wallet provider's sessionStorage so silent `boing_accounts`
 * works after a full navigation. Only call this when the resolved provider
 * is actually the web wallet — never when the extension is preferred.
 */
export function seedWebWalletAccounts(owner: string) {
  try {
    const store = browserSessionStorage();
    if (!store) return;
    const want = hex32(owner);
    let current: unknown;
    try {
      current = JSON.parse(store.getItem(BOING_WEB_ACCOUNTS_KEY) || "[]");
    } catch {
      current = [];
    }
    const list = Array.isArray(current) ? current : [];
    if (list[0] && hex32(String(list[0])) === want) return;
    store.setItem(BOING_WEB_ACCOUNTS_KEY, JSON.stringify([want]));
  } catch {
    /* ignore */
  }
}

/** Synchronously restore the cached owner before the first header paint. */
export function hydrateCachedWallet(): string | null {
  return loadCachedWalletOwner();
}

export function providerKindOf(
  provider: BoingProvider | null | undefined,
): WalletProviderKind | null {
  if (!provider) return null;
  return provider.isBoingWeb ? "web" : "extension";
}

function asProvider(value: unknown): BoingProvider | null {
  if (
    value &&
    typeof value === "object" &&
    typeof (value as BoingProvider).request === "function"
  ) {
    return value as BoingProvider;
  }
  return null;
}

type InjectEvent = { type?: string; detail?: unknown };
type InjectListener = (event: InjectEvent) => void;

type InjectHost = {
  boing?: BoingProvider;
  window?: { boing?: BoingProvider };
  addEventListener?: (type: string, fn: InjectListener) => void;
  removeEventListener?: (type: string, fn: InjectListener) => void;
  dispatchEvent?: (event: { type: string }) => boolean;
};

export function getInjectedBoingProvider(
  globalObj: InjectHost = globalThis as unknown as InjectHost,
): BoingProvider | null {
  return asProvider(globalObj.boing) ?? asProvider(globalObj.window?.boing);
}

function looksLikeBoingAnnouncement(detail: unknown): BoingProvider | null {
  if (!detail || typeof detail !== "object") return null;
  const d = detail as {
    info?: { rdns?: string; name?: string };
    provider?: unknown;
  };
  const info = d.info;
  const looksBoing =
    (typeof info?.rdns === "string" && /boing/i.test(info.rdns)) ||
    (typeof info?.name === "string" && /boing/i.test(info.name));
  if (!looksBoing) return null;
  return asProvider(d.provider);
}

/**
 * Wait for the Express extension to inject `window.boing`.
 * Listens for `boing#initialized` and EIP-6963 announcements, and polls.
 */
export function waitForInjectedBoing(
  timeoutMs = EXTENSION_INJECT_WAIT_MS,
  globalObj: InjectHost = globalThis as unknown as InjectHost,
): Promise<BoingProvider | null> {
  const existing = getInjectedBoingProvider(globalObj);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    let settled = false;
    const hosts: InjectHost[] = [globalObj];
    if (globalObj.window && globalObj.window !== globalObj) {
      hosts.push(globalObj.window as InjectHost);
    }

    const finish = (provider: BoingProvider | null) => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      clearTimeout(timer);
      for (const host of hosts) {
        host.removeEventListener?.(BOING_INITIALIZED_EVENT, onInit);
        host.removeEventListener?.(EIP6963_ANNOUNCE_EVENT, onAnnounce);
      }
      resolve(provider);
    };

    const check = () => {
      const provider = getInjectedBoingProvider(globalObj);
      if (provider) finish(provider);
    };

    const onInit = () => check();
    const onAnnounce = (event: InjectEvent) => {
      const detail = event.detail;
      const announced = looksLikeBoingAnnouncement(detail);
      if (announced) {
        finish(announced);
        return;
      }
      check();
    };

    for (const host of hosts) {
      host.addEventListener?.(BOING_INITIALIZED_EVENT, onInit);
      host.addEventListener?.(EIP6963_ANNOUNCE_EVENT, onAnnounce);
    }
    try {
      globalObj.dispatchEvent?.({ type: EIP6963_REQUEST_EVENT });
    } catch {
      /* ignore */
    }

    const poll = setInterval(check, 50);
    const timer = setTimeout(
      () => finish(getInjectedBoingProvider(globalObj)),
      Math.max(0, timeoutMs),
    );
  });
}

function createWebWalletProvider(): BoingProvider {
  return createBoingWebWalletProvider({
    chainId: CHAIN_HEX,
    mode: "popup",
  }) as BoingProvider;
}

/**
 * Resolve the provider to use. Always prefers a present (or soon-to-inject)
 * Express extension and never opens the web wallet when the extension is
 * installed or was the last used provider.
 */
export async function resolveBoingProvider(opts?: {
  waitMs?: number;
  allowWeb?: boolean;
  globalObj?: InjectHost;
}): Promise<{ provider: BoingProvider; kind: WalletProviderKind } | null> {
  const globalObj = opts?.globalObj ?? (globalThis as unknown as InjectHost);
  const cachedKind = loadCachedProviderKind();
  const injected =
    getInjectedBoingProvider(globalObj) ??
    (await waitForInjectedBoing(
      opts?.waitMs ?? EXTENSION_INJECT_WAIT_MS,
      globalObj,
    ));
  if (injected) return { provider: injected, kind: "extension" };

  // Last connection was the extension but it did not inject — do not fall back.
  if (cachedKind === "extension") return null;

  const allowWeb = opts?.allowWeb ?? true;
  if (!allowWeb) return null;
  return { provider: createWebWalletProvider(), kind: "web" };
}

/** Sync helper: injected extension if already present, otherwise no provider. */
export function getBoingProvider(): BoingProvider | null {
  return getInjectedBoingProvider();
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

function remember(owner: string, kind: WalletProviderKind) {
  saveCachedWalletOwner(owner, kind);
  if (kind === "web") seedWebWalletAccounts(owner);
}

/**
 * Restore a previously authorized Express session without prompting.
 * Waits briefly for the extension before considering the web wallet.
 */
export async function tryRestoreWalletSession(
  provider?: BoingProvider,
  opts?: { waitMs?: number; globalObj?: InjectHost },
): Promise<{
  provider: BoingProvider;
  owner: string;
  kind: RestoreKind;
  providerKind: WalletProviderKind;
} | null> {
  const cached = loadCachedWalletOwner();
  const resolved = provider
    ? { provider, kind: providerKindOf(provider) ?? "extension" }
    : await resolveBoingProvider(opts);
  if (!resolved) {
    return null;
  }
  const accounts = await readBoingAccounts(resolved.provider);
  const live = accounts[0] ? hex32(accounts[0]) : null;

  if (live) {
    if (resolved.kind === "extension") {
      try {
        const chain = await resolved.provider.request({
          method: "boing_chainId",
          params: [],
        });
        if (Number(chain) !== 6913 && Number(chain) !== 0x1b01) {
          if (cached)
            return {
              provider: resolved.provider,
              owner: cached,
              kind: "cached",
              providerKind: resolved.kind,
            };
          return null;
        }
      } catch {
        if (cached)
          return {
            provider: resolved.provider,
            owner: cached,
            kind: "cached",
            providerKind: resolved.kind,
          };
        return null;
      }
    }
    remember(live, resolved.kind);
    return {
      provider: resolved.provider,
      owner: live,
      kind: "live",
      providerKind: resolved.kind,
    };
  }

  if (cached) {
    if (resolved.kind === "web") seedWebWalletAccounts(cached);
    return {
      provider: resolved.provider,
      owner: cached,
      kind: "cached",
      providerKind: resolved.kind,
    };
  }
  return null;
}

/** Interactive connect (may open Express). Call from a click handler. */
export async function requestWalletSession(provider?: BoingProvider): Promise<{
  provider: BoingProvider;
  owner: string;
  providerKind: WalletProviderKind;
}> {
  const resolved = provider
    ? { provider, kind: providerKindOf(provider) ?? "extension" }
    : await resolveBoingProvider({ allowWeb: true });
  if (!resolved) {
    throw new Error(
      "Boing Express extension not found. Enable it and try again.",
    );
  }
  const accounts = (await resolved.provider.request({
    method: "boing_requestAccounts",
    params: [],
  })) as string[];
  if (!accounts?.[0]) throw new Error("No Express account returned");
  const owner = hex32(accounts[0]);
  if (resolved.kind === "extension") {
    const chain = await resolved.provider.request({
      method: "boing_chainId",
      params: [],
    });
    if (Number(chain) !== 6913 && Number(chain) !== 0x1b01)
      throw new Error("Switch Express to Boing testnet 6913 before continuing");
    const again = await readBoingAccounts(resolved.provider);
    if (!again[0] || hex32(again[0]) !== owner)
      throw new Error("Wallet account changed. Disconnect and reconnect.");
  }
  remember(owner, resolved.kind);
  return { provider: resolved.provider, owner, providerKind: resolved.kind };
}

/**
 * Ensure the preferred provider is bound. Interactive clicks may prompt the
 * extension (never the web wallet when the extension is present or was used).
 */
export async function ensurePreferredProvider(opts?: {
  interactive?: boolean;
  expectedOwner?: string;
  waitMs?: number;
}): Promise<{
  provider: BoingProvider;
  owner: string;
  providerKind: WalletProviderKind;
}> {
  const cachedKind = loadCachedProviderKind();
  const resolved = await resolveBoingProvider({
    waitMs: opts?.waitMs,
    allowWeb: cachedKind !== "extension",
  });
  if (!resolved) {
    throw new Error(
      cachedKind === "extension"
        ? "Open or enable the Boing Express extension to continue."
        : "Connect Boing Express first",
    );
  }
  const want = opts?.expectedOwner ? hex32(opts.expectedOwner) : null;
  const accounts = await readBoingAccounts(resolved.provider);
  if (accounts[0]) {
    const owner = hex32(accounts[0]);
    remember(owner, resolved.kind);
    return { provider: resolved.provider, owner, providerKind: resolved.kind };
  }
  if (opts?.interactive) {
    return requestWalletSession(resolved.provider);
  }
  const cached = loadCachedWalletOwner();
  if (cached) {
    if (resolved.kind === "web") seedWebWalletAccounts(cached);
    return {
      provider: resolved.provider,
      owner: want ?? cached,
      providerKind: resolved.kind,
    };
  }
  throw new Error("Connect Boing Express first");
}

/**
 * Silent probe only — never opens Express. Kept for tests and soft checks.
 */
export async function ensureLiveWalletSession(
  provider: BoingProvider,
  expectedOwner: string,
): Promise<{ provider: BoingProvider; owner: string }> {
  const want = hex32(expectedOwner);
  const kind = providerKindOf(provider) ?? loadCachedProviderKind() ?? "web";
  const accounts = await readBoingAccounts(provider);
  if (accounts[0] && hex32(accounts[0]) === want) {
    remember(want, kind);
    return { provider, owner: want };
  }
  if (accounts[0]) {
    const other = hex32(accounts[0]);
    remember(other, kind);
    return { provider, owner: other };
  }
  const cached = loadCachedWalletOwner();
  if (cached) {
    if (kind === "web") seedWebWalletAccounts(cached);
    return { provider, owner: cached };
  }
  throw new Error("Connect Boing Express first");
}

export function clearWalletSession(provider: BoingProvider | null) {
  clearCachedWalletOwner();
  try {
    provider?.disconnect?.();
  } catch {
    /* ignore */
  }
}

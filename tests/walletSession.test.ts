import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BOING_WEB_ACCOUNTS_KEY,
  clearCachedWalletOwner,
  clearWalletSession,
  ensureLiveWalletSession,
  formatWalletLabel,
  hydrateCachedWallet,
  loadCachedWalletOwner,
  readBoingAccounts,
  requestWalletSession,
  saveCachedWalletOwner,
  tryRestoreWalletSession,
  type BoingProvider,
} from "../src/wallet/session";
import {
  clearSocialSession,
  loadSocialSession,
  saveSocialSession,
} from "../src/social/sessionCache";

const store = new Map<string, string>();
const sessionStore = new Map<string, string>();

function memoryStorage(map: Map<string, string>): Storage {
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    key: (index: number) => [...map.keys()][index] ?? null,
  };
}

beforeEach(() => {
  store.clear();
  sessionStore.clear();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: memoryStorage(store),
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: memoryStorage(sessionStore),
  });
});

afterEach(() => {
  clearCachedWalletOwner();
  clearSocialSession();
});

function mockProvider(accounts: string[], opts?: { isBoingWeb?: boolean }) {
  const request = vi.fn(async ({ method }: { method: string }) => {
    if (method === "boing_accounts") return accounts;
    if (method === "boing_requestAccounts")
      return accounts.length ? accounts : ["0x" + "aa".repeat(32)];
    if (method === "boing_chainId") return 6913;
    throw new Error("unexpected " + method);
  });
  return {
    request,
    isBoingWeb: opts?.isBoingWeb ?? true,
  } as unknown as BoingProvider;
}

describe("wallet session cache", () => {
  it("persists and clears the cached owner", () => {
    const owner = "0x" + "ab".repeat(32);
    saveCachedWalletOwner(owner);
    expect(loadCachedWalletOwner()).toBe(owner);
    clearCachedWalletOwner();
    expect(loadCachedWalletOwner()).toBeNull();
  });

  it("restores from silent boing_accounts and writes cache", async () => {
    const owner = "0x" + "cd".repeat(32);
    const provider = mockProvider([owner]);
    const session = await tryRestoreWalletSession(provider);
    expect(session?.kind).toBe("live");
    expect(session?.owner).toBe(owner);
    expect(loadCachedWalletOwner()).toBe(owner);
  });

  it("falls back to localStorage when accounts are empty", async () => {
    const owner = "0x" + "ef".repeat(32);
    saveCachedWalletOwner(owner);
    const provider = mockProvider([]);
    const session = await tryRestoreWalletSession(provider);
    expect(session?.kind).toBe("cached");
    expect(session?.owner).toBe(owner);
  });

  it("returns null when nothing is cached and accounts are empty", async () => {
    const provider = mockProvider([]);
    expect(await tryRestoreWalletSession(provider)).toBeNull();
  });

  it("saves cache on interactive connect and clears on disconnect helper", async () => {
    const owner = "0x" + "11".repeat(32);
    const provider = mockProvider([owner]);
    const session = await requestWalletSession(provider);
    expect(session.owner).toBe(owner);
    expect(loadCachedWalletOwner()).toBe(owner);
    clearWalletSession(provider);
    expect(loadCachedWalletOwner()).toBeNull();
  });

  it("reads empty accounts without throwing", async () => {
    const provider = mockProvider([]);
    (provider.request as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("no session"),
    );
    expect(await readBoingAccounts(provider)).toEqual([]);
  });
});

describe("social session localStorage", () => {
  it("persists the 15-min token across loads for mini-game attempts", () => {
    const owner = "0x" + "22".repeat(32);
    saveSocialSession({
      owner,
      token: "tok-abc",
      expires_at: Date.now() + 15 * 60_000,
    });
    expect(loadSocialSession(owner)?.token).toBe("tok-abc");
    expect(store.has("boing-pets-social-session-v1")).toBe(true);
  });
});

describe("hydrate and silent restore", () => {
  it("formats a compact address without a reconnecting suffix", () => {
    const owner = "0x" + "e8".repeat(32);
    expect(formatWalletLabel(owner)).toBe("0xe8e8e8…e8e8");
    expect(formatWalletLabel(owner)).not.toMatch(/reconnecting/i);
  });

  it("hydrates the cached owner and seeds web-wallet sessionStorage", () => {
    const owner = "0x" + "ab".repeat(32);
    saveCachedWalletOwner(owner);
    expect(hydrateCachedWallet()).toBe(owner);
    expect(
      JSON.parse(sessionStore.get(BOING_WEB_ACCOUNTS_KEY) || "[]"),
    ).toEqual([owner]);
  });

  it("does not call requestAccounts during restore or ensureLive", async () => {
    const owner = "0x" + "cd".repeat(32);
    saveCachedWalletOwner(owner);
    const provider = mockProvider([]);
    const restored = await tryRestoreWalletSession(provider);
    expect(restored).toEqual({ provider, owner, kind: "cached" });
    const ensured = await ensureLiveWalletSession(provider, owner);
    expect(ensured.owner).toBe(owner);
    const methods = (
      provider.request as ReturnType<typeof vi.fn>
    ).mock.calls.map((c) => c[0].method);
    expect(methods).not.toContain("boing_requestAccounts");
  });

  it("keeps the cached owner when a silent probe fails", async () => {
    const owner = "0x" + "11".repeat(32);
    saveCachedWalletOwner(owner);
    const provider = mockProvider([]);
    (provider.request as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ method }: { method: string }) => {
        if (method === "boing_accounts")
          throw new Error("Boing Express window was closed.");
        throw new Error("unexpected " + method);
      },
    );
    const restored = await tryRestoreWalletSession(provider);
    expect(restored?.owner).toBe(owner);
    expect(restored?.kind).toBe("cached");
    expect(loadCachedWalletOwner()).toBe(owner);
  });
});

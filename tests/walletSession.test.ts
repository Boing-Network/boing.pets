import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearCachedWalletOwner,
  clearWalletSession,
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

beforeEach(() => {
  store.clear();
  const mock: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    key: (index: number) => [...store.keys()][index] ?? null,
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: mock,
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    },
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

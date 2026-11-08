import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearPresenceToken,
  loadPresenceToken,
  savePresenceToken,
} from "../src/world/lib/presenceTokenCache";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
  });
});

afterEach(() => {
  clearPresenceToken();
});

describe("presence token cache", () => {
  it("stores and returns a non-expired token for owner+zone", () => {
    const owner = "0x" + "ab".repeat(32);
    savePresenceToken({
      token: "tok-1",
      owner,
      zone: "starter-town",
      expires_at: Date.now() + 60_000,
    });
    expect(loadPresenceToken(owner, "starter-town")?.token).toBe("tok-1");
    expect(loadPresenceToken(owner, "other-zone")).toBeNull();
  });

  it("ignores tokens that are about to expire", () => {
    const owner = "0x" + "cd".repeat(32);
    savePresenceToken({
      token: "tok-soon",
      owner,
      zone: "starter-town",
      expires_at: Date.now() + 1_000,
    });
    expect(loadPresenceToken(owner, "starter-town")).toBeNull();
  });
});

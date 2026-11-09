import { describe, expect, it } from "vitest";
import {
  friendPair,
  isSocialKind,
  PARTY_SIZE_MAX,
  sanitizeDisplayName,
  sanitizeMessage,
} from "../src/social";

describe("social helpers", () => {
  it("orders friend pairs lexicographically", () => {
    const a = "0x" + "11".repeat(32);
    const b = "0x" + "22".repeat(32);
    expect(friendPair(a, b)).toEqual([a, b]);
    expect(friendPair(b, a)).toEqual([a, b]);
  });

  it("sanitizes display names and messages", () => {
    expect(sanitizeDisplayName("  Pasture Pal ")).toBe("Pasture Pal");
    expect(sanitizeDisplayName("Cafe\u0301")).toBe("Caf\u00e9");
    expect(() => sanitizeDisplayName("<>")).toThrow();
    expect(() => sanitizeDisplayName("x")).toThrow();
    expect(() => sanitizeDisplayName("bad<script>")).toThrow();
    expect(() => sanitizeDisplayName("hi\u200bthere")).toThrow();
    expect(() => sanitizeDisplayName("a\u202Eb")).toThrow();
    expect(sanitizeMessage("hello there")).toBe("hello there");
    expect(() => sanitizeMessage("")).toThrow();
    expect(() => sanitizeMessage("x".repeat(300))).toThrow();
    expect(() => sanitizeMessage("hello\u0000")).toThrow();
  });

  it("includes party kinds and caps party size", () => {
    expect(isSocialKind("party_create")).toBe(true);
    expect(isSocialKind("party_invite")).toBe(true);
    expect(PARTY_SIZE_MAX).toBe(4);
  });
});

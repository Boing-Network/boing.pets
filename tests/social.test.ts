import { describe, expect, it } from "vitest";
import {
  friendPair,
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
    expect(() => sanitizeDisplayName("<>")).toThrow();
    expect(() => sanitizeDisplayName("x")).toThrow();
    expect(sanitizeMessage("hello there")).toBe("hello there");
    expect(() => sanitizeMessage("")).toThrow();
    expect(() => sanitizeMessage("x".repeat(300))).toThrow();
  });
});

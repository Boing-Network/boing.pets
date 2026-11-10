import { describe, expect, it } from "vitest";
import {
  canSendChat,
  chatWindowOk,
  PASTURE_CHAT_MAX,
  PASTURE_CHAT_MIN_MS,
  PASTURE_CHAT_WINDOW_MAX,
  sanitizePastureChat,
} from "../src/content/pastureChat";

describe("pasture chat sanitizer and rate limit", () => {
  it("accepts a short kind message and trims it", () => {
    expect(sanitizePastureChat("  Hello pasture!  ")).toBe("Hello pasture!");
  });

  it("rejects empty, overlong, URL, and profane messages", () => {
    expect(() => sanitizePastureChat("")).toThrow();
    expect(() => sanitizePastureChat("x".repeat(PASTURE_CHAT_MAX + 1))).toThrow(
      /max/,
    );
    expect(() => sanitizePastureChat("visit https://evil.test now")).toThrow(
      /Links/,
    );
    expect(() => sanitizePastureChat("that's some shit luck")).toThrow(/kind/);
    expect(() => sanitizePastureChat("<script>alert(1)</script>")).toThrow();
  });

  it("enforces a cooldown and a short sliding window", () => {
    const now = 10_000;
    expect(canSendChat(null, now)).toBe(true);
    expect(canSendChat(now - PASTURE_CHAT_MIN_MS + 10, now)).toBe(false);
    expect(canSendChat(now - PASTURE_CHAT_MIN_MS, now)).toBe(true);
    const filled = Array.from(
      { length: PASTURE_CHAT_WINDOW_MAX },
      (_, i) => now - i * 200,
    );
    expect(chatWindowOk(filled, now)).toBe(false);
    expect(chatWindowOk(filled.slice(1), now)).toBe(true);
  });
});

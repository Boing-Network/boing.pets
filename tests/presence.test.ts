import { describe, expect, it } from "vitest";
import {
  colorFromSeed,
  guestPresenceIdentity,
  parseClientPresenceMessage,
  PRESENCE_MAX_PLAYERS,
  WALLET_ID_RE,
} from "../src/world/lib/presenceProtocol";

describe("plaza presence protocol", () => {
  it("accepts a valid hello and move", () => {
    expect(
      parseClientPresenceMessage(
        JSON.stringify({
          type: "hello",
          id: "guest-12345678",
          name: "Bounce",
          color: "#7fa7ff",
          x: 1,
          y: 0.9,
          z: -2,
        }),
      ),
    ).toMatchObject({ type: "hello", name: "Bounce", color: "#7fa7ff" });
    expect(
      parseClientPresenceMessage(
        JSON.stringify({ type: "move", x: 2, y: 0.9, z: 3 }),
      ),
    ).toEqual({ type: "move", x: 2, y: 0.9, z: 3 });
  });

  it("accepts wallet-length ids and optional presence tokens", () => {
    const wallet = "0x" + "ab".repeat(32);
    expect(wallet.length).toBe(66);
    expect(WALLET_ID_RE.test(wallet)).toBe(true);
    expect(
      parseClientPresenceMessage(
        JSON.stringify({
          type: "hello",
          id: wallet,
          name: "PasturePal",
          color: "#abcdef",
          x: 0,
          y: 0,
          z: 0,
          token: "11111111-2222-3333-4444-555555555555",
        }),
      ),
    ).toMatchObject({
      type: "hello",
      id: wallet,
      token: "11111111-2222-3333-4444-555555555555",
    });
  });

  it("rejects unsafe or malformed payloads", () => {
    expect(parseClientPresenceMessage("{")).toBeNull();
    expect(
      parseClientPresenceMessage(
        JSON.stringify({
          type: "hello",
          id: "short",
          name: "x",
          color: "blue",
          x: 0,
          y: 0,
          z: 0,
        }),
      ),
    ).toBeNull();
    expect(
      parseClientPresenceMessage(
        JSON.stringify({ type: "move", x: Infinity, y: 0, z: 0 }),
      ),
    ).toBeNull();
    expect(
      parseClientPresenceMessage(
        JSON.stringify({
          type: "hello",
          id: "guest-12345678",
          name: "<script>",
          color: "#abcdef",
          x: 0,
          y: 0,
          z: 0,
        }),
      ),
    ).toMatchObject({ name: "script" });
  });

  it("creates guest identities within plaza caps", () => {
    const guest = guestPresenceIdentity();
    expect(guest.id.length).toBeGreaterThanOrEqual(8);
    expect(guest.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(colorFromSeed("same")).toBe(colorFromSeed("same"));
    expect(PRESENCE_MAX_PLAYERS).toBe(32);
  });
});

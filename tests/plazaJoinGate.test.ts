import { describe, expect, it } from "vitest";
import {
  canSendPlazaMove,
  phaseAfterSocketOpen,
  phaseAfterWelcome,
  plazaErrorMessage,
} from "../src/world/lib/plazaJoinGate";

describe("plaza join gate", () => {
  it("blocks moves until welcome (wallet hello can race D1)", () => {
    expect(canSendPlazaMove("connecting")).toBe(false);
    expect(canSendPlazaMove("handshaking")).toBe(false);
    expect(canSendPlazaMove("live")).toBe(true);
    expect(canSendPlazaMove("error")).toBe(false);
  });

  it("advances connecting → handshaking → live", () => {
    expect(phaseAfterSocketOpen("connecting")).toBe("handshaking");
    expect(phaseAfterWelcome("handshaking")).toBe("live");
  });

  it("rewrites Send hello first so it is not confused with daily care hello", () => {
    expect(plazaErrorMessage("Send hello first")).toMatch(/handshake/i);
    expect(plazaErrorMessage("Send hello first")).not.toMatch(/daily/i);
    expect(plazaErrorMessage("Plaza is full. Try again soon.")).toBe(
      "Plaza is full. Try again soon.",
    );
  });
});

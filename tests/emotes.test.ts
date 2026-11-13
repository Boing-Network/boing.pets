import { describe, expect, it } from "vitest";
import {
  canSendEmote,
  EMOTE_COOLDOWN_MS,
  emoteActive,
  EMOTE_DURATION_MS,
  isEmoteId,
  shouldTriggerSocialPlay,
  SOCIAL_PLAY_COOLDOWN_MS,
  SOCIAL_PLAY_RADIUS,
} from "../src/world/lib/emotes";
import { parseClientPresenceMessage } from "../src/world/lib/presenceProtocol";

describe("pet emotes and social play", () => {
  it("accepts only known emote ids", () => {
    expect(isEmoteId("wave")).toBe(true);
    expect(isEmoteId("play")).toBe(true);
    expect(isEmoteId("dance")).toBe(false);
    expect(
      parseClientPresenceMessage(
        JSON.stringify({ type: "emote", emote: "heart" }),
      ),
    ).toEqual({ type: "emote", emote: "heart" });
    expect(
      parseClientPresenceMessage(
        JSON.stringify({ type: "emote", emote: "nope" }),
      ),
    ).toBeNull();
  });

  it("enforces a cooldown and a finite emote window", () => {
    expect(canSendEmote(1000, 1000 + EMOTE_COOLDOWN_MS - 1)).toBe(false);
    expect(canSendEmote(1000, 1000 + EMOTE_COOLDOWN_MS)).toBe(true);
    expect(emoteActive(1000, 1000 + EMOTE_DURATION_MS - 1)).toBe(true);
    expect(emoteActive(1000, 1000 + EMOTE_DURATION_MS)).toBe(false);
  });

  it("triggers social play when two pets first meet, then waits", () => {
    const me = { x: 0, z: 0 };
    const pal = { id: "0xpal", x: SOCIAL_PLAY_RADIUS - 0.2, z: 0 };
    const now = 50_000;
    expect(
      shouldTriggerSocialPlay({
        now,
        selfId: "0xme",
        myPos: me,
        others: [pal],
        lastPlayByPeer: new Map(),
      })?.id,
    ).toBe("0xpal");
    expect(
      shouldTriggerSocialPlay({
        now: now + SOCIAL_PLAY_COOLDOWN_MS - 1,
        selfId: "0xme",
        myPos: me,
        others: [pal],
        lastPlayByPeer: new Map([["0xpal", now]]),
      }),
    ).toBeNull();
    expect(
      shouldTriggerSocialPlay({
        now: now + SOCIAL_PLAY_COOLDOWN_MS,
        selfId: "0xme",
        myPos: me,
        others: [pal],
        lastPlayByPeer: new Map([["0xpal", now]]),
      })?.id,
    ).toBe("0xpal");
  });

  it("ignores far, self, or anonymous peers", () => {
    expect(
      shouldTriggerSocialPlay({
        now: 1,
        selfId: "0xme",
        myPos: { x: 0, z: 0 },
        others: [
          { id: "0xme", x: 0.2, z: 0 },
          { id: "0xfar", x: SOCIAL_PLAY_RADIUS + 0.5, z: 0 },
          { id: "", x: 0.1, z: 0 },
        ],
        lastPlayByPeer: new Map(),
      }),
    ).toBeNull();
  });
});

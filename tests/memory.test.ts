import { describe, expect, it } from "vitest";
import { DAY } from "../src/core";
import { buildPetMind, favoriteActivity } from "../src/memory";

const owner = "0x" + "11".repeat(32);
const pet = {
  owner,
  hatch_tx: "0x" + "22".repeat(32),
  created_at: 10 * DAY,
};

describe("pet mind / memory engine", () => {
  it("picks a favorite non-hatch activity", () => {
    expect(
      favoriteActivity({
        hatch: 1,
        feed: 1,
        checkin: 1,
        play: 4,
        groom: 1,
      }),
    ).toBe("play");
  });

  it("suggests feed when neglected and play when playful", () => {
    const lonely = buildPetMind(
      pet,
      [{ action: "hatch", created_at: pet.created_at }],
      "Friendly",
      pet.created_at + 5 * DAY,
    );
    expect(lonely.mood).toBe("lonely");
    expect(lonely.suggestion.toLowerCase()).toContain("feed");

    const playful = buildPetMind(
      pet,
      [
        { action: "hatch", created_at: pet.created_at },
        { action: "play", created_at: pet.created_at + DAY },
        { action: "play", created_at: pet.created_at + 2 * DAY },
        { action: "feed", created_at: pet.created_at + 2 * DAY },
      ],
      "Adventurous",
      pet.created_at + 2 * DAY,
    );
    expect(playful.favoriteActivity).toBe("play");
    expect(playful.suggestion.toLowerCase()).toMatch(/play|lake/);
    expect(playful.cues.length).toBeGreaterThan(0);
  });
});

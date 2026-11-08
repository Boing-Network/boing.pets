import { describe, expect, it } from "vitest";
import { DAY } from "../src/core";
import { unlockedCollections } from "../src/content/collections";
import { isQuestComplete, questPeriodKey, QUESTS } from "../src/content/quests";
import { activeEvents } from "../src/content/seasons";

const pet = {
  owner: "0x" + "11".repeat(32),
  hatch_tx: "0x" + "22".repeat(32),
  created_at: 10 * DAY,
};

describe("content framework", () => {
  it("marks story hatch complete and daily hello only after checkin", () => {
    const story = QUESTS.find((q) => q.id === "story_first_bounce")!;
    const hello = QUESTS.find((q) => q.id === "daily_hello")!;
    const now = pet.created_at;
    expect(isQuestComplete(story, pet, [], now, [])).toBe(true);
    expect(isQuestComplete(hello, pet, [], now, [])).toBe(false);
    expect(
      isQuestComplete(
        hello,
        pet,
        [{ action: "checkin", created_at: now }],
        now,
        [],
      ),
    ).toBe(true);
    expect(questPeriodKey(hello, now)).toMatch(/^d:/);
  });

  it("keeps a year-round testnet festival active", () => {
    const now = Date.UTC(2026, 10, 8);
    expect(activeEvents(now).map((e) => e.id)).toContain("testnet-festival");
  });

  it("unlocks species and cosmetic collection entries", () => {
    expect(
      unlockedCollections({
        pet,
        species: "Boingle",
        events: [],
        inventoryIds: ["hat-ribbon"],
        now: pet.created_at,
      }),
    ).toEqual(
      expect.arrayContaining(["species:Boingle", "cosmetic:hat-ribbon"]),
    );
  });
});

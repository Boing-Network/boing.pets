import { describe, expect, it } from "vitest";
import { DAY } from "../src/core";
import {
  COLLECTION_CATEGORY_ORDER,
  COLLECTION_DEFS,
  collectionProgress,
  collectionLogCopy,
  unlockedCollections,
} from "../src/content/collections";
import { collectionIconSvg, silhouetteIconSvg } from "../src/ui/itemIcons";
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

  it("summarizes collection progress by category", () => {
    const progress = collectionProgress(COLLECTION_DEFS, [
      "species:Boingle",
      "cosmetic:hat-ribbon",
    ]);
    expect(progress.total).toBe(COLLECTION_DEFS.length);
    expect(progress.unlocked).toBe(2);
    expect(progress.byCategory.species?.unlocked).toBe(1);
    expect(progress.byCategory.cosmetic?.unlocked).toBe(1);
    expect(progress.byCategory.fish?.total).toBeGreaterThan(0);
    expect(progress.byCategory.ores?.total).toBeGreaterThan(0);
    expect(progress.byCategory.discovery?.total).toBeGreaterThan(0);
    for (const key of COLLECTION_CATEGORY_ORDER) {
      expect(progress.byCategory[key]?.total).toBeGreaterThan(0);
    }
  });

  it("provides a self-hosted icon for every collection entry", () => {
    for (const def of COLLECTION_DEFS) {
      const icon = collectionIconSvg(def.id);
      expect(icon, def.id).toContain("<svg");
      expect(icon, def.id).not.toContain("undefined");
    }
  });

  it("hides undiscovered collection names behind silhouettes", () => {
    const sample = COLLECTION_DEFS.find((d) => d.category === "fish")!;
    const hidden = collectionLogCopy(sample, false);
    expect(hidden.revealed).toBe(false);
    expect(hidden.title).toBe("???");
    expect(hidden.description).toMatch(/unknown fish/i);
    expect(hidden.description).not.toContain(sample.title);
    const shown = collectionLogCopy(sample, true);
    expect(shown.title).toBe(sample.title);
    expect(shown.description).toBe(sample.description);
  });

  it("renders locked icons as silhouettes without the original palette", () => {
    const sample = COLLECTION_DEFS[0]!;
    const art = collectionIconSvg(sample.id);
    const shadow = collectionIconSvg(sample.id, { silhouette: true });
    expect(shadow).toContain("is-silhouette");
    expect(shadow).toContain("currentColor");
    expect(shadow).not.toContain('<rect width="64" height="64"');
    expect(silhouetteIconSvg(art)).toBe(shadow);
  });
});

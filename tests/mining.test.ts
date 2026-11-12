import { describe, expect, it } from "vitest";
import { unlockedCollections } from "../src/content/collections";
import {
  isOreItem,
  MINING_STAMINA_MAX,
  ORES,
  pickaxeTier,
  pickOre,
} from "../src/content/mining";

describe("mining content", () => {
  it("defines ores, stamina, and pickaxe tiers", () => {
    expect(ORES.length).toBe(5);
    expect(MINING_STAMINA_MAX).toBe(10);
    expect(isOreItem("ore-spark")).toBe(true);
    expect(pickaxeTier([])).toBe(1);
    expect(pickaxeTier(["tool-pick-iron"])).toBe(2);
    expect(pickaxeTier(["tool-pick-crystal", "tool-pick-iron"])).toBe(3);
  });

  it("gates rare crystal ore behind pickaxe tier 2", () => {
    const samples = Array.from(
      { length: 40 },
      (_, i) => pickOre(`seed-${i}`, 1).id,
    );
    expect(samples).not.toContain("ore-crystal");
    expect(pickOre("crystal-seed", 2).minTier).toBeLessThanOrEqual(2);
  });

  it("unlocks ore discoveries from inventory", () => {
    const unlocked = unlockedCollections({
      pet: null,
      species: null,
      events: [],
      inventoryIds: ["ore-pebble"],
      now: Date.now(),
    });
    expect(unlocked).toContain("discovery:ore:ore-pebble");
  });
});

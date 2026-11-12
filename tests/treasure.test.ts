import { describe, expect, it } from "vitest";
import { unlockedCollections } from "../src/content/collections";
import {
  clueForSpot,
  isTreasureItem,
  pickSpot,
  pickTreasure,
  TREASURE_DAILY_DIG_CAP,
  TREASURE_GRID,
  TREASURES,
} from "../src/content/treasure";

describe("treasure content", () => {
  it("commits spots and loot deterministically", () => {
    expect(pickSpot("same")).toBe(pickSpot("same"));
    expect(pickSpot("same")).toBeGreaterThanOrEqual(0);
    expect(pickSpot("same")).toBeLessThan(TREASURE_GRID);
    expect(pickTreasure("seed").id).toBe(pickTreasure("seed").id);
    expect(clueForSpot(0).length).toBeGreaterThan(8);
    expect(TREASURES.length).toBe(5);
    expect(TREASURE_DAILY_DIG_CAP).toBe(3);
  });

  it("unlocks treasure discoveries from inventory", () => {
    const unlocked = unlockedCollections({
      pet: null,
      species: null,
      events: [],
      inventoryIds: ["loot-sun-shard"],
      now: Date.now(),
    });
    expect(unlocked).toContain("discovery:treasure:loot-sun-shard");
    expect(isTreasureItem("loot-pebble")).toBe(true);
  });
});

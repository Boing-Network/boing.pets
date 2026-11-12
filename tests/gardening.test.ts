import { describe, expect, it } from "vitest";
import { unlockedCollections } from "../src/content/collections";
import {
  CROPS,
  GARDEN_SLOTS,
  isCropItem,
  isGardenKind,
  isValidSlot,
} from "../src/content/gardening";

describe("gardening content", () => {
  it("defines three crops and three slots", () => {
    expect(CROPS.length).toBe(5);
    expect(GARDEN_SLOTS).toBe(3);
    expect(isValidSlot(0)).toBe(true);
    expect(isValidSlot(3)).toBe(false);
    expect(isGardenKind("plant")).toBe(true);
    expect(isGardenKind("dig")).toBe(false);
  });

  it("unlocks crop discoveries from inventory", () => {
    const unlocked = unlockedCollections({
      pet: null,
      species: null,
      events: [],
      inventoryIds: ["crop-berry"],
      now: Date.now(),
    });
    expect(unlocked).toContain("discovery:crop:crop-berry");
    expect(isCropItem("crop-sprout")).toBe(true);
  });
});

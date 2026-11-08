import { describe, expect, it } from "vitest";
import { unlockedCollections } from "../src/content/collections";
import {
  isRibbonItem,
  placeFromReaction,
  RACE_DAILY_HEAT_CAP,
  RIBBONS,
  TRACKS,
} from "../src/content/racing";

describe("racing content", () => {
  it("defines tracks, ribbons, and daily heat cap", () => {
    expect(TRACKS.length).toBe(3);
    expect(RIBBONS.length).toBe(3);
    expect(RACE_DAILY_HEAT_CAP).toBe(3);
    expect(isRibbonItem("ribbon-gold")).toBe(true);
  });

  it("maps reaction timing to race places", () => {
    expect(placeFromReaction(200)).toBe(1);
    expect(placeFromReaction(800)).toBe(2);
    expect(placeFromReaction(1800)).toBe(3);
    expect(placeFromReaction(5000)).toBeNull();
    expect(placeFromReaction(-1)).toBeNull();
  });

  it("unlocks ribbon discoveries from inventory", () => {
    const unlocked = unlockedCollections({
      pet: null,
      species: null,
      events: [],
      inventoryIds: ["ribbon-silver"],
      now: Date.now(),
    });
    expect(unlocked).toContain("discovery:ribbon:ribbon-silver");
  });
});

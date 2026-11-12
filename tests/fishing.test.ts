import { describe, expect, it } from "vitest";
import {
  biteDelayMs,
  FISH,
  FISHING_BITE_MAX_MS,
  FISHING_BITE_MIN_MS,
  FISHING_DAILY_CATCH_CAP,
  fishById,
  isFishItem,
  pickFish,
} from "../src/content/fishing";
import { unlockedCollections } from "../src/content/collections";

describe("fishing content", () => {
  it("picks fish deterministically from a seed", () => {
    expect(pickFish("same-seed").id).toBe(pickFish("same-seed").id);
    expect(fishById("fish-ripple")?.name).toBe("Ripple Minnow");
    expect(FISH.length).toBe(5);
    expect(FISHING_DAILY_CATCH_CAP).toBe(3);
  });

  it("keeps bite delay inside the configured window", () => {
    for (const seed of ["a", "b", "cast-123", "0xabc"]) {
      const delay = biteDelayMs(seed);
      expect(delay).toBeGreaterThanOrEqual(FISHING_BITE_MIN_MS);
      expect(delay).toBeLessThanOrEqual(FISHING_BITE_MAX_MS);
    }
  });

  it("unlocks fish discoveries from inventory", () => {
    const unlocked = unlockedCollections({
      pet: null,
      species: null,
      events: [],
      inventoryIds: ["fish-moonkoi", "frame-gold"],
      now: Date.now(),
    });
    expect(unlocked).toEqual(
      expect.arrayContaining([
        "discovery:fish:fish-moonkoi",
        "cosmetic:frame-gold",
      ]),
    );
    expect(isFishItem("fish-boingfin")).toBe(true);
    expect(isFishItem("halo-frame")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { unlockedCollections } from "../src/content/collections";
import {
  applyFoodBoosts,
  COOK_DAILY_CAP,
  isCookKind,
  isFoodItem,
  recipeById,
  RECIPES,
} from "../src/content/cooking";

describe("cooking content", () => {
  it("defines three recipes with food outputs", () => {
    expect(RECIPES.length).toBe(3);
    expect(COOK_DAILY_CAP).toBe(5);
    expect(isCookKind("cook")).toBe(true);
    expect(isCookKind("bake")).toBe(false);
    expect(isFoodItem("food-sprout-salad")).toBe(true);
    expect(recipeById("recipe-berry-glaze")?.ingredients.length).toBe(2);
  });

  it("applies hunger and energy boosts from servings", () => {
    const boosted = applyFoodBoosts({ hunger: 50, energy: 40 }, [
      { food_id: "food-berry-glaze" },
      { food_id: "food-sprout-salad" },
    ]);
    expect(boosted.hunger).toBe(90);
    expect(boosted.energy).toBe(50);
    expect(boosted.snacksToday).toBe(2);
  });

  it("unlocks cookbook discoveries from recipe ids", () => {
    const unlocked = unlockedCollections({
      pet: null,
      species: null,
      events: [],
      inventoryIds: ["food-sprout-salad"],
      now: Date.now(),
    });
    expect(unlocked).not.toContain("cosmetic:food-sprout-salad");
    expect(
      unlockedCollections({
        pet: null,
        species: null,
        events: [],
        inventoryIds: [],
        now: Date.now(),
      }),
    ).not.toContain("discovery:recipe:recipe-sprout-salad");
  });
});

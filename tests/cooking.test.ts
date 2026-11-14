import { describe, expect, it } from "vitest";
import { unlockedCollections } from "../src/content/collections";
import {
  applyFoodBoosts,
  COOK_DAILY_CAP,
  foodBoostFor,
  formatKitchenCounts,
  formatKitchenSummary,
  isCookKind,
  isFoodItem,
  isServableFood,
  recipeById,
  RECIPES,
  SERVE_DAILY_CAP,
} from "../src/content/cooking";

describe("cooking content", () => {
  it("defines three recipes with food outputs", () => {
    expect(RECIPES.length).toBe(5);
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

  it("applies a care boost when serving a pasture snack", () => {
    expect(isServableFood("food-snack")).toBe(true);
    expect(foodBoostFor("food-snack")).toEqual({
      foodId: "food-snack",
      hungerBoost: 12,
      energyBoost: 4,
    });
    const boosted = applyFoodBoosts({ hunger: 50, energy: 40 }, [
      { food_id: "food-snack" },
    ]);
    expect(boosted.hunger).toBe(62);
    expect(boosted.energy).toBe(44);
    expect(boosted.snacksToday).toBe(1);
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

  it("formats kitchen counts with zero and cap defaults when fields are missing", () => {
    expect(formatKitchenCounts({})).toBe(
      `Cooked 0/${COOK_DAILY_CAP} · served 0/${SERVE_DAILY_CAP}`,
    );
    expect(
      formatKitchenCounts({
        cookedToday: 2,
        cookCap: 5,
        servedToday: 1,
        serveCap: 5,
      }),
    ).toBe(`Cooked 2/5 · served 1/5`);
    expect(formatKitchenSummary({}, "today")).toBe(
      `Cooked 0/${COOK_DAILY_CAP} · served 0/${SERVE_DAILY_CAP} · today`,
    );
    expect(
      formatKitchenCounts({ cookedToday: undefined, cookCap: undefined }),
    ).not.toMatch(/undefined/);
  });
});

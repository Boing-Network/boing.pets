import { dayOf } from "../core";

export const COOK_DAILY_CAP = 5;
export const SERVE_DAILY_CAP = 5;
export const COOK_KINDS = ["cook", "serve"] as const;
export type CookKind = (typeof COOK_KINDS)[number];

export interface RecipeIngredient {
  itemId: string;
  qty: number;
}

export interface RecipeDef {
  id: string;
  name: string;
  ingredients: RecipeIngredient[];
  foodId: string;
  foodName: string;
  rewardBoinglets: number;
  hungerBoost: number;
  energyBoost: number;
}

export const RECIPES: RecipeDef[] = [
  {
    id: "recipe-sprout-salad",
    name: "Sprout Salad",
    ingredients: [{ itemId: "crop-sprout", qty: 1 }],
    foodId: "food-sprout-salad",
    foodName: "Sprout Salad",
    rewardBoinglets: 4,
    hungerBoost: 15,
    energyBoost: 0,
  },
  {
    id: "recipe-berry-glaze",
    name: "Berry Glaze Fish",
    ingredients: [
      { itemId: "crop-berry", qty: 1 },
      { itemId: "fish-ripple", qty: 1 },
    ],
    foodId: "food-berry-glaze",
    foodName: "Berry Glaze Fish",
    rewardBoinglets: 10,
    hungerBoost: 25,
    energyBoost: 10,
  },
  {
    id: "recipe-moon-feast",
    name: "Moon Feast",
    ingredients: [
      { itemId: "crop-moonbloom", qty: 1 },
      { itemId: "fish-moonkoi", qty: 1 },
    ],
    foodId: "food-moon-feast",
    foodName: "Moon Feast",
    rewardBoinglets: 22,
    hungerBoost: 40,
    energyBoost: 20,
  },
];

export function recipeById(id: string): RecipeDef | undefined {
  return RECIPES.find((r) => r.id === id);
}

export function recipeByFoodId(foodId: string): RecipeDef | undefined {
  return RECIPES.find((r) => r.foodId === foodId);
}

export function isFoodItem(itemId: string): boolean {
  return itemId.startsWith("food-");
}

export function isCookKind(value: unknown): value is CookKind {
  return (
    typeof value === "string" &&
    (COOK_KINDS as readonly string[]).includes(value)
  );
}

export function cookingDayKey(now: number): string {
  return `d:${dayOf(now)}`;
}

export function applyFoodBoosts<T extends { hunger: number; energy: number }>(
  base: T,
  servings: Array<{ food_id: string }>,
): T & { snacksToday: number } {
  let hunger = base.hunger;
  let energy = base.energy;
  for (const serving of servings) {
    const recipe = recipeByFoodId(serving.food_id);
    if (!recipe) continue;
    hunger = Math.min(100, hunger + recipe.hungerBoost);
    energy = Math.min(100, energy + recipe.energyBoost);
  }
  return { ...base, hunger, energy, snacksToday: servings.length };
}

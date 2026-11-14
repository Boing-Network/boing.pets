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
    name: "Curb Salad",
    ingredients: [{ itemId: "crop-sprout", qty: 1 }],
    foodId: "food-sprout-salad",
    foodName: "Curb Salad",
    rewardBoinglets: 4,
    hungerBoost: 15,
    energyBoost: 0,
  },
  {
    id: "recipe-berry-glaze",
    name: "Lot-Glaze Fish",
    ingredients: [
      { itemId: "crop-berry", qty: 1 },
      { itemId: "fish-ripple", qty: 1 },
    ],
    foodId: "food-berry-glaze",
    foodName: "Lot-Glaze Fish",
    rewardBoinglets: 10,
    hungerBoost: 25,
    energyBoost: 10,
  },
  {
    id: "recipe-honey-tart",
    name: "Block Tart",
    ingredients: [
      { itemId: "crop-honeyroot", qty: 1 },
      { itemId: "crop-berry", qty: 1 },
    ],
    foodId: "food-honey-tart",
    foodName: "Block Tart",
    rewardBoinglets: 12,
    hungerBoost: 22,
    energyBoost: 8,
  },
  {
    id: "recipe-moon-feast",
    name: "Night Feast",
    ingredients: [
      { itemId: "crop-moonbloom", qty: 1 },
      { itemId: "fish-moonkoi", qty: 1 },
    ],
    foodId: "food-moon-feast",
    foodName: "Night Feast",
    rewardBoinglets: 22,
    hungerBoost: 40,
    energyBoost: 20,
  },
  {
    id: "recipe-starlit",
    name: "After-Hours Broth",
    ingredients: [
      { itemId: "crop-starglider", qty: 1 },
      { itemId: "fish-starfin", qty: 1 },
    ],
    foodId: "food-starlit",
    foodName: "After-Hours Broth",
    rewardBoinglets: 32,
    hungerBoost: 45,
    energyBoost: 25,
  },
];

export function recipeById(id: string): RecipeDef | undefined {
  return RECIPES.find((r) => r.id === id);
}

export function recipeByFoodId(foodId: string): RecipeDef | undefined {
  return RECIPES.find((r) => r.foodId === foodId);
}

/** Care boosts for foods that can be served from the bag, including activity snacks. */
export type FoodBoost = {
  foodId: string;
  hungerBoost: number;
  energyBoost: number;
};

export const SNACK_BOOSTS: readonly FoodBoost[] = [
  { foodId: "food-snack", hungerBoost: 12, energyBoost: 4 },
];

export function foodBoostFor(foodId: string): FoodBoost | undefined {
  const recipe = recipeByFoodId(foodId);
  if (recipe) {
    return {
      foodId: recipe.foodId,
      hungerBoost: recipe.hungerBoost,
      energyBoost: recipe.energyBoost,
    };
  }
  return SNACK_BOOSTS.find((snack) => snack.foodId === foodId);
}

export function isFoodItem(itemId: string): boolean {
  return itemId.startsWith("food-");
}

export function isServableFood(itemId: string): boolean {
  return !!foodBoostFor(itemId);
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
    const boost = foodBoostFor(serving.food_id);
    if (!boost) continue;
    hunger = Math.min(100, hunger + boost.hungerBoost);
    energy = Math.min(100, energy + boost.energyBoost);
  }
  return { ...base, hunger, energy, snacksToday: servings.length };
}

export function formatKitchenCounts(data: {
  cookedToday?: number | null;
  servedToday?: number | null;
  cookCap?: number | null;
  serveCap?: number | null;
}): string {
  const n = (value: number | null | undefined, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const cooked = n(data.cookedToday, 0);
  const served = n(data.servedToday, 0);
  const cookCap = n(data.cookCap, COOK_DAILY_CAP);
  const serveCap = n(data.serveCap, SERVE_DAILY_CAP);
  return `Cooked ${cooked}/${cookCap} · served ${served}/${serveCap}`;
}

export function formatKitchenSummary(
  data: {
    cookedToday?: number | null;
    servedToday?: number | null;
    cookCap?: number | null;
    serveCap?: number | null;
  },
  extra?: string,
): string {
  const counts = formatKitchenCounts(data);
  const tail = (extra || "").trim();
  return tail ? `${counts} · ${tail}` : counts;
}

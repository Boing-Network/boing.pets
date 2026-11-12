/** Crafting table: combine activity resources into existing catalog items. */

import { dayOf } from "../core";
import { onchainItemByGameId, ONCHAIN_RESERVED_ITEM_IDS } from "./onchainItems";

export const CRAFT_DAILY_CAP = 10;
export const CRAFT_TABLE_VERSION = "craft:v1";

export interface CraftIngredient {
  itemId: string;
  qty: number;
}

export interface CraftRecipe {
  id: string;
  name: string;
  description: string;
  inputs: CraftIngredient[];
  outputItemId: string;
  outputQty: number;
}

const FORAGE_NAMES: Record<string, string> = {
  "crop-forage": "Foraged Greens",
};

export const CRAFT_RECIPES: CraftRecipe[] = [
  {
    id: "craft-iron-pick",
    name: "Forge an Iron Pick",
    description: "Smelt pebble and spark ore into a sturdier pick.",
    inputs: [
      { itemId: "ore-pebble", qty: 3 },
      { itemId: "ore-spark", qty: 1 },
    ],
    outputItemId: "tool-pick-iron",
    outputQty: 1,
  },
  {
    id: "craft-crystal-pick",
    name: "Crystal-tip a Pick",
    description: "Upgrade an Iron Pick with crystal and spark ore.",
    inputs: [
      { itemId: "tool-pick-iron", qty: 1 },
      { itemId: "ore-crystal", qty: 2 },
      { itemId: "ore-spark", qty: 1 },
    ],
    outputItemId: "tool-pick-crystal",
    outputQty: 1,
  },
  {
    id: "craft-trail-cushion",
    name: "Stuff a Trail Cushion",
    description: "Bundle garden greens and a pebble keepsake into furniture.",
    inputs: [
      { itemId: "crop-sprout", qty: 2 },
      { itemId: "crop-forage", qty: 1 },
      { itemId: "loot-pebble", qty: 1 },
    ],
    outputItemId: "furn-cushion",
    outputQty: 1,
  },
  {
    id: "craft-sun-lamp",
    name: "Assemble a Sun Lamp",
    description: "Set a sun shard in spark ore and berry glass.",
    inputs: [
      { itemId: "loot-sun-shard", qty: 1 },
      { itemId: "ore-spark", qty: 1 },
      { itemId: "crop-berry", qty: 1 },
    ],
    outputItemId: "furn-lamp",
    outputQty: 1,
  },
  {
    id: "craft-ribbon-hat",
    name: "Weave a Ribbon Hat",
    description: "Stitch map scraps and a berry dye into a ribbon hat.",
    inputs: [
      { itemId: "loot-map-scrap", qty: 2 },
      { itemId: "crop-berry", qty: 1 },
    ],
    outputItemId: "hat-ribbon",
    outputQty: 1,
  },
];

const BLOCKED_ITEM_IDS = new Set<string>([
  "tool-pick-wood",
  ...ONCHAIN_RESERVED_ITEM_IDS.filter((row) =>
    row.gameItemId.startsWith("ribbon-"),
  ).map((row) => row.gameItemId),
]);

export function craftRecipeById(id: string): CraftRecipe | undefined {
  return CRAFT_RECIPES.find((recipe) => recipe.id === id);
}

const RESERVED_NAMES: Record<string, string> = {
  "tool-pick-wood": "Wood Pick",
  "ribbon-gold": "Gold Ribbon",
  "ribbon-silver": "Silver Ribbon",
  "ribbon-bronze": "Bronze Ribbon",
};

export function craftItemName(itemId: string): string {
  return (
    onchainItemByGameId(itemId)?.name ||
    RESERVED_NAMES[itemId] ||
    FORAGE_NAMES[itemId] ||
    itemId
  );
}

export function assertSafeCraftRecipe(recipe: CraftRecipe): void {
  const output = recipe.outputItemId;
  if (
    output.startsWith("pet-") ||
    output === "boingle" ||
    output.startsWith("food-") ||
    output.startsWith("ribbon-") ||
    BLOCKED_ITEM_IDS.has(output)
  ) {
    throw new Error(`Refusing to craft reserved item ${output}`);
  }
  if (!onchainItemByGameId(output)) {
    throw new Error(`Unknown craft output ${output}`);
  }
  for (const input of recipe.inputs) {
    if (input.qty <= 0 || !Number.isSafeInteger(input.qty)) {
      throw new Error(`Invalid input qty for ${input.itemId}`);
    }
    if (!onchainItemByGameId(input.itemId) && !FORAGE_NAMES[input.itemId]) {
      throw new Error(`Unknown craft input ${input.itemId}`);
    }
  }
  if (recipe.outputQty <= 0 || !Number.isSafeInteger(recipe.outputQty)) {
    throw new Error("Invalid output qty");
  }
}

for (const recipe of CRAFT_RECIPES) assertSafeCraftRecipe(recipe);

export function canCraftRecipe(
  recipe: CraftRecipe,
  inventory: Record<string, number>,
): boolean {
  return recipe.inputs.every((ing) => (inventory[ing.itemId] || 0) >= ing.qty);
}

export function missingIngredients(
  recipe: CraftRecipe,
  inventory: Record<string, number>,
): CraftIngredient[] {
  return recipe.inputs
    .map((ing) => ({
      itemId: ing.itemId,
      qty: Math.max(0, ing.qty - (inventory[ing.itemId] || 0)),
    }))
    .filter((ing) => ing.qty > 0);
}

export function craftDayKey(now: number): string {
  return `d:${dayOf(now)}`;
}

export function publicCraftRules() {
  return {
    version: CRAFT_TABLE_VERSION,
    dailyCap: CRAFT_DAILY_CAP,
    kitchen:
      "Cooked snacks stay in the Kitchen. This table is for activity resources.",
  };
}

/** Inventory grouping and quick actions for the in-pasture bag. */

import { RECIPES, type RecipeDef } from "../content/cooking";
import { itemDisplayName, itemMarketCategory } from "../content/items";
import { isSellableItem, MARKET_MIN_BOING } from "../market";

export const PASTURE_INVENTORY_LIST_PRICE = MARKET_MIN_BOING;

export type InventoryTab = "items" | "crops" | "fish" | "recipes";

export const INVENTORY_TABS: readonly InventoryTab[] = [
  "items",
  "crops",
  "fish",
  "recipes",
];

export type InventoryUseArea = "cook" | "customize" | "home";

export type InventoryEntry = {
  id: string;
  name: string;
  qty: number;
  tab: InventoryTab;
  sellable: boolean;
  useArea: InventoryUseArea | null;
  iconId: string;
  ready?: boolean;
};

export type InventoryRow = { item_id: string; qty: number };

export function inventoryTabFor(itemId: string): InventoryTab {
  if (itemId.startsWith("recipe-")) return "recipes";
  const category = itemMarketCategory(itemId);
  if (category === "crops") return "crops";
  if (category === "fish") return "fish";
  return "items";
}

export function inventoryUseArea(itemId: string): InventoryUseArea | null {
  const tab = inventoryTabFor(itemId);
  if (tab === "recipes" || tab === "crops" || tab === "fish") return "cook";
  if (itemId.startsWith("food-")) return "cook";
  const category = itemMarketCategory(itemId);
  if (category === "cosmetics") return "customize";
  if (category === "furniture") return "home";
  return null;
}

export function recipeIsReady(
  recipe: RecipeDef,
  qtyById: Map<string, number>,
): boolean {
  return recipe.ingredients.every(
    (ingredient) => (qtyById.get(ingredient.itemId) ?? 0) >= ingredient.qty,
  );
}

export function buildInventoryEntries(
  rows: InventoryRow[],
  recipes: readonly RecipeDef[] = RECIPES,
): InventoryEntry[] {
  const qtyById = new Map(
    rows.filter((row) => row.qty > 0).map((row) => [row.item_id, row.qty]),
  );
  const items: InventoryEntry[] = [...qtyById.entries()].map(([id, qty]) => ({
    id,
    name: itemDisplayName(id),
    qty,
    tab: inventoryTabFor(id),
    sellable: isSellableItem(id),
    useArea: inventoryUseArea(id),
    iconId: id,
  }));
  const recipeEntries: InventoryEntry[] = recipes.map((recipe) => ({
    id: recipe.id,
    name: recipe.name,
    qty: recipeIsReady(recipe, qtyById) ? 1 : 0,
    tab: "recipes" as const,
    sellable: false,
    useArea: "cook" as const,
    iconId: recipe.foodId,
    ready: recipeIsReady(recipe, qtyById),
  }));
  return [...items, ...recipeEntries];
}

export function entriesForTab(
  entries: InventoryEntry[],
  tab: InventoryTab,
): InventoryEntry[] {
  return entries.filter((entry) => entry.tab === tab);
}

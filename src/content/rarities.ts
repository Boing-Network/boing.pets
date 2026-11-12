/** Shared item rarity used by inventory, craft, market filters, and drops. */

export const ITEM_RARITIES = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
] as const;

export type ItemRarity = (typeof ITEM_RARITIES)[number];

export const ITEM_RARITY_LABELS: Record<ItemRarity, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
};

/** Care-drop "premium" pity and weekly caps apply to legendary cosmetics. */
export function isLegendaryRarity(value: string | null | undefined): boolean {
  return value === "legendary" || value === "premium";
}

export function isItemRarity(value: unknown): value is ItemRarity {
  return (
    typeof value === "string" &&
    (ITEM_RARITIES as readonly string[]).includes(value)
  );
}

export const MARKET_CATEGORIES = [
  "ores",
  "fish",
  "loot",
  "crops",
  "food",
  "tools",
  "cosmetics",
  "furniture",
] as const;

export type MarketCategory = (typeof MARKET_CATEGORIES)[number];

export const MARKET_CATEGORY_LABELS: Record<MarketCategory, string> = {
  ores: "Ores",
  fish: "Fish",
  loot: "Loot",
  crops: "Crops",
  food: "Food",
  tools: "Tools",
  cosmetics: "Cosmetics",
  furniture: "Furniture",
};

export function isMarketCategory(value: unknown): value is MarketCategory {
  return (
    typeof value === "string" &&
    (MARKET_CATEGORIES as readonly string[]).includes(value)
  );
}

export function marketCategoryFromGameId(
  gameItemId: string,
  fallback?: string,
): MarketCategory | null {
  if (gameItemId.startsWith("ore-")) return "ores";
  if (gameItemId.startsWith("fish-")) return "fish";
  if (gameItemId.startsWith("loot-")) return "loot";
  if (gameItemId.startsWith("crop-")) return "crops";
  if (gameItemId.startsWith("food-")) return "food";
  if (gameItemId.startsWith("tool-")) return "tools";
  if (gameItemId.startsWith("furn-")) return "furniture";
  if (
    gameItemId.startsWith("hat-") ||
    gameItemId.startsWith("frame-") ||
    gameItemId.startsWith("ribbon-")
  )
    return "cosmetics";
  if (fallback === "ore") return "ores";
  if (fallback === "fish") return "fish";
  if (fallback === "treasure") return "loot";
  if (fallback === "crop") return "crops";
  if (fallback === "food") return "food";
  if (fallback === "material" || fallback === "tool") return "tools";
  if (fallback === "furniture") return "furniture";
  if (fallback === "cosmetic") return "cosmetics";
  return null;
}

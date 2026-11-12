/** Unified item guide: names, categories, rarities, and how to obtain each stack. */

import { CATALOG } from "../economy";
import { RECIPES } from "./cooking";
import { CRAFT_RECIPES, craftItemName } from "./crafting";
import { FISH } from "./fishing";
import { CROPS } from "./gardening";
import { ORES, PICKAXES } from "./mining";
import {
  ONCHAIN_ITEMS,
  ONCHAIN_RESERVED_ITEM_IDS,
  onchainItemByGameId,
} from "./onchainItems";
import {
  type ItemRarity,
  type MarketCategory,
  marketCategoryFromGameId,
} from "./rarities";
import { TREASURES } from "./treasure";

export type ItemGuideRow = {
  gameItemId: string;
  name: string;
  itemId: number | null;
  category: MarketCategory;
  rarity: ItemRarity;
  source: string;
  onChain: boolean;
  sellable: boolean;
};

const RARITY: Record<string, ItemRarity> = {
  "ore-pebble": "common",
  "ore-spark": "uncommon",
  "ore-crystal": "rare",
  "ore-emberite": "rare",
  "ore-aetherite": "epic",
  "fish-ripple": "common",
  "fish-boingfin": "uncommon",
  "fish-moonkoi": "rare",
  "fish-copperfin": "uncommon",
  "fish-starfin": "epic",
  "loot-pebble": "common",
  "loot-map-scrap": "uncommon",
  "loot-sun-shard": "rare",
  "loot-wind-bell": "uncommon",
  "loot-comet-bead": "epic",
  "crop-sprout": "common",
  "crop-berry": "uncommon",
  "crop-moonbloom": "rare",
  "crop-honeyroot": "uncommon",
  "crop-starglider": "epic",
  "crop-forage": "common",
  "food-sprout-salad": "common",
  "food-berry-glaze": "uncommon",
  "food-moon-feast": "rare",
  "food-honey-tart": "uncommon",
  "food-starlit": "epic",
  "tool-pick-wood": "common",
  "tool-pick-iron": "uncommon",
  "tool-pick-crystal": "rare",
  "tool-pick-aether": "epic",
  "hat-ribbon": "common",
  "hat-antenna": "uncommon",
  "hat-leaf": "uncommon",
  "hat-stardust": "legendary",
  "hat-comet": "epic",
  "frame-gold": "rare",
  "frame-aurora": "legendary",
  "furn-cushion": "uncommon",
  "furn-lamp": "rare",
  "furn-lantern": "rare",
  "ribbon-gold": "rare",
  "ribbon-silver": "uncommon",
  "ribbon-bronze": "common",
};

const SOURCE: Record<string, string> = {
  "ore-pebble": "Mining",
  "ore-spark": "Mining",
  "ore-crystal": "Mining (Iron Pick or better)",
  "ore-emberite": "Mining (Iron Pick or better)",
  "ore-aetherite": "Mining (Crystal Pick or better)",
  "fish-ripple": "Fishing",
  "fish-boingfin": "Fishing",
  "fish-moonkoi": "Fishing",
  "fish-copperfin": "Fishing",
  "fish-starfin": "Fishing",
  "loot-pebble": "Treasure dig",
  "loot-map-scrap": "Treasure dig",
  "loot-sun-shard": "Treasure dig",
  "loot-wind-bell": "Treasure dig",
  "loot-comet-bead": "Treasure dig",
  "crop-sprout": "Garden",
  "crop-berry": "Garden",
  "crop-moonbloom": "Garden",
  "crop-honeyroot": "Garden",
  "crop-starglider": "Garden",
  "crop-forage": "Garden forage",
  "food-sprout-salad": "Kitchen",
  "food-berry-glaze": "Kitchen",
  "food-moon-feast": "Kitchen",
  "food-honey-tart": "Kitchen",
  "food-starlit": "Kitchen",
  "tool-pick-wood": "Starter tool (off-chain, not sellable)",
  "tool-pick-iron": "Crafting Station or catalog",
  "tool-pick-crystal": "Crafting Station or catalog",
  "tool-pick-aether": "Crafting Station or catalog",
  "hat-ribbon": "Care drop or catalog",
  "hat-antenna": "Care drop or catalog",
  "hat-leaf": "Care drop, Crafting Station, or catalog",
  "hat-stardust": "Care drop or Sparkles catalog",
  "hat-comet": "Care drop, Crafting Station, or Sparkles catalog",
  "frame-gold": "Care drop or catalog",
  "frame-aurora": "Care drop or Sparkles catalog",
  "furn-cushion": "Care drop, Crafting Station, or catalog",
  "furn-lamp": "Care drop, Crafting Station, or catalog",
  "furn-lantern": "Care drop, Crafting Station, or catalog",
  "ribbon-gold": "Racing (off-chain, not sellable)",
  "ribbon-silver": "Racing (off-chain, not sellable)",
  "ribbon-bronze": "Racing (off-chain, not sellable)",
};

const EXTRA_NAMES: Record<string, string> = {
  "crop-forage": "Foraged Greens",
  "tool-pick-wood": "Wood Pick",
  "ribbon-gold": "Gold Ribbon",
  "ribbon-silver": "Silver Ribbon",
  "ribbon-bronze": "Bronze Ribbon",
};

export function itemDisplayName(gameItemId: string): string {
  return (
    onchainItemByGameId(gameItemId)?.name ||
    CATALOG.find((item) => item.id === gameItemId)?.name ||
    EXTRA_NAMES[gameItemId] ||
    craftItemName(gameItemId)
  );
}

export function itemRarity(gameItemId: string): ItemRarity | null {
  return RARITY[gameItemId] ?? null;
}

export function itemMarketCategory(gameItemId: string): MarketCategory | null {
  const mapped = onchainItemByGameId(gameItemId);
  return marketCategoryFromGameId(gameItemId, mapped?.category);
}

export function itemSource(gameItemId: string): string {
  return SOURCE[gameItemId] || "Unknown";
}

function reservedIds(): Set<string> {
  return new Set(ONCHAIN_RESERVED_ITEM_IDS.map((row) => row.gameItemId));
}

function sellableFlag(gameItemId: string, onChain: boolean): boolean {
  if (reservedIds().has(gameItemId)) return false;
  if (gameItemId.startsWith("ribbon-")) return false;
  if (gameItemId === "tool-pick-wood") return false;
  if (gameItemId.startsWith("pet-") || gameItemId === "boingle") return false;
  return onChain || CATALOG.some((item) => item.id === gameItemId);
}

function rowFor(
  gameItemId: string,
  itemId: number | null,
  onChain: boolean,
): ItemGuideRow | null {
  const category = itemMarketCategory(gameItemId);
  const rarity = itemRarity(gameItemId);
  if (!category || !rarity) return null;
  return {
    gameItemId,
    name: itemDisplayName(gameItemId),
    itemId,
    category,
    rarity,
    source: itemSource(gameItemId),
    onChain,
    sellable: sellableFlag(gameItemId, onChain),
  };
}

/** Existing and new stackables, plus reserved off-chain ids for the item table. */
export function itemGuide(): ItemGuideRow[] {
  const seen = new Set<string>();
  const rows: ItemGuideRow[] = [];
  const add = (id: string, itemId: number | null, onChain: boolean) => {
    if (seen.has(id)) return;
    const row = rowFor(id, itemId, onChain);
    if (!row) return;
    seen.add(id);
    rows.push(row);
  };

  for (const item of ONCHAIN_ITEMS) add(item.gameItemId, item.itemId, true);
  for (const item of ORES)
    add(
      item.id,
      onchainItemByGameId(item.id)?.itemId ?? null,
      !!onchainItemByGameId(item.id),
    );
  for (const item of FISH)
    add(
      item.id,
      onchainItemByGameId(item.id)?.itemId ?? null,
      !!onchainItemByGameId(item.id),
    );
  for (const item of TREASURES)
    add(
      item.id,
      onchainItemByGameId(item.id)?.itemId ?? null,
      !!onchainItemByGameId(item.id),
    );
  for (const item of CROPS)
    add(
      item.id,
      onchainItemByGameId(item.id)?.itemId ?? null,
      !!onchainItemByGameId(item.id),
    );
  for (const item of RECIPES)
    add(
      item.foodId,
      onchainItemByGameId(item.foodId)?.itemId ?? null,
      !!onchainItemByGameId(item.foodId),
    );
  for (const item of PICKAXES) {
    const mapped = onchainItemByGameId(item.id);
    add(item.id, mapped?.itemId ?? null, !!mapped);
  }
  for (const item of CATALOG) {
    const mapped = onchainItemByGameId(item.id);
    add(item.id, mapped?.itemId ?? null, !!mapped);
  }
  for (const recipe of CRAFT_RECIPES) {
    const mapped = onchainItemByGameId(recipe.outputItemId);
    add(recipe.outputItemId, mapped?.itemId ?? null, !!mapped);
  }
  for (const reserved of ONCHAIN_RESERVED_ITEM_IDS) {
    add(reserved.gameItemId, reserved.itemId, false);
  }
  add("crop-forage", null, false);

  const rank = (row: ItemGuideRow) =>
    row.itemId ?? (row.gameItemId === "crop-forage" ? 1000 : 2000);
  return rows.sort(
    (a, b) => rank(a) - rank(b) || a.gameItemId.localeCompare(b.gameItemId),
  );
}

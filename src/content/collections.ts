import type { CareEvent, Pet } from "../core";
import { state } from "../core";
import { CATALOG } from "../economy";
import { SPECIES } from "../core";
import { FISH, isFishItem } from "./fishing";
import { CROPS, isCropItem } from "./gardening";
import { isFoodItem, RECIPES } from "./cooking";
import { isOreItem, ORES } from "./mining";
import { isRibbonItem, RIBBONS } from "./racing";
import { isTreasureItem, TREASURES } from "./treasure";

export type CollectionCategory =
  | "species"
  | "fish"
  | "treasure"
  | "crops"
  | "recipes"
  | "ores"
  | "ribbons"
  | "discovery"
  | "cosmetic";

export const COLLECTION_CATEGORY_LABELS: Record<CollectionCategory, string> = {
  species: "Species",
  fish: "Fish",
  treasure: "Treasure",
  crops: "Crops",
  recipes: "Recipes",
  ores: "Ores",
  ribbons: "Race ribbons",
  discovery: "Discoveries",
  cosmetic: "Cosmetics",
};

export const COLLECTION_CATEGORY_ORDER: CollectionCategory[] = [
  "species",
  "fish",
  "treasure",
  "crops",
  "recipes",
  "ores",
  "ribbons",
  "discovery",
  "cosmetic",
];

export interface CollectionEntry {
  id: string;
  title: string;
  description: string;
  category: CollectionCategory;
}

export const COLLECTION_DEFS: CollectionEntry[] = [
  ...SPECIES.map((species) => ({
    id: `species:${species}`,
    title: species,
    description: `Hatch a ${species}.`,
    category: "species" as const,
  })),
  {
    id: "discovery:stray_home",
    title: "Homecoming",
    description: "Feed your buddy after it has gone scruffy or stray.",
    category: "discovery",
  },
  {
    id: "discovery:streak_7",
    title: "Week of Wobbles",
    description: "Reach a 7-day care streak.",
    category: "discovery",
  },
  ...FISH.map((fish) => ({
    id: `discovery:fish:${fish.id}`,
    title: fish.name,
    description: `Catch a ${fish.name} (${fish.rarity}).`,
    category: "fish" as const,
  })),
  ...TREASURES.map((loot) => ({
    id: `discovery:treasure:${loot.id}`,
    title: loot.name,
    description: `Dig up a ${loot.name} (${loot.rarity}).`,
    category: "treasure" as const,
  })),
  ...CROPS.map((crop) => ({
    id: `discovery:crop:${crop.id}`,
    title: crop.name,
    description: `Harvest a ${crop.name} from your garden.`,
    category: "crops" as const,
  })),
  ...RECIPES.map((recipe) => ({
    id: `discovery:recipe:${recipe.id}`,
    title: recipe.name,
    description: `Cook ${recipe.name} for the first time.`,
    category: "recipes" as const,
  })),
  ...ORES.map((ore) => ({
    id: `discovery:ore:${ore.id}`,
    title: ore.name,
    description: `Mine a ${ore.name} (${ore.rarity}).`,
    category: "ores" as const,
  })),
  ...RIBBONS.map((ribbon) => ({
    id: `discovery:ribbon:${ribbon.id}`,
    title: ribbon.name,
    description: `Place ${ribbon.place}${ribbon.place === 1 ? "st" : ribbon.place === 2 ? "nd" : "rd"} in a pet race.`,
    category: "ribbons" as const,
  })),
  ...CATALOG.map((item) => ({
    id: `cosmetic:${item.id}`,
    title: item.name,
    description: `Own the ${item.name} cosmetic.`,
    category: "cosmetic" as const,
  })),
];

export function unlockedCollections(args: {
  pet: Pet | null;
  species: string | null;
  events: CareEvent[];
  inventoryIds: string[];
  now: number;
  sawScruffyFeed?: boolean;
}): string[] {
  const out: string[] = [];
  if (args.species) out.push(`species:${args.species}`);
  if (args.pet) {
    const s = state(args.pet, args.events, args.now);
    if (s.streak >= 7) out.push("discovery:streak_7");
    if (args.sawScruffyFeed) out.push("discovery:stray_home");
  }
  for (const id of args.inventoryIds) {
    if (isFishItem(id)) out.push(`discovery:fish:${id}`);
    else if (isTreasureItem(id)) out.push(`discovery:treasure:${id}`);
    else if (isCropItem(id)) out.push(`discovery:crop:${id}`);
    else if (isOreItem(id)) out.push(`discovery:ore:${id}`);
    else if (isRibbonItem(id)) out.push(`discovery:ribbon:${id}`);
    else if (isFoodItem(id)) {
      /* dishes unlock via recipe discovery on cook */
    } else out.push(`cosmetic:${id}`);
  }
  return [...new Set(out)];
}

export function collectionProgress(
  defs: CollectionEntry[],
  unlockedIds: string[],
): {
  unlocked: number;
  total: number;
  byCategory: Record<string, { unlocked: number; total: number }>;
} {
  const unlocked = new Set(unlockedIds);
  const byCategory: Record<string, { unlocked: number; total: number }> = {};
  for (const def of defs) {
    const bucket = (byCategory[def.category] ??= { unlocked: 0, total: 0 });
    bucket.total += 1;
    if (unlocked.has(def.id)) bucket.unlocked += 1;
  }
  return {
    unlocked: unlockedIds.filter((id) => defs.some((d) => d.id === id)).length,
    total: defs.length,
    byCategory,
  };
}

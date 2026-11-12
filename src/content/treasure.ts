import { dayOf } from "../core";
import type { ItemRarity } from "./rarities";

export const TREASURE_DAILY_DIG_CAP = 3;
export const TREASURE_GRID = 9;

export interface TreasureDef {
  id: string;
  name: string;
  rarity: ItemRarity;
  rewardBoinglets: number;
  weight: number;
}

export const TREASURES: TreasureDef[] = [
  {
    id: "loot-pebble",
    name: "Lucky Pebble",
    rarity: "common",
    rewardBoinglets: 5,
    weight: 46,
  },
  {
    id: "loot-map-scrap",
    name: "Map Scrap",
    rarity: "uncommon",
    rewardBoinglets: 12,
    weight: 24,
  },
  {
    id: "loot-wind-bell",
    name: "Wind Bell",
    rarity: "uncommon",
    rewardBoinglets: 14,
    weight: 16,
  },
  {
    id: "loot-sun-shard",
    name: "Sun Shard",
    rarity: "rare",
    rewardBoinglets: 28,
    weight: 10,
  },
  {
    id: "loot-comet-bead",
    name: "Comet Bead",
    rarity: "epic",
    rewardBoinglets: 40,
    weight: 4,
  },
];

export const DIG_CLUES = [
  "Warm earth under the morning light.",
  "A soft mound near the north fence.",
  "Mossy soil by the east gate.",
  "Where the path forks toward the garden.",
  "A hollow that smells like rain.",
  "Beside the crooked tutorial sign.",
  "In the shade of the market board.",
  "Close to the pond pier boards.",
  "A sunny patch by the cottage gate.",
] as const;

export function treasureById(id: string): TreasureDef | undefined {
  return TREASURES.find((t) => t.id === id);
}

export function isTreasureItem(itemId: string): boolean {
  return itemId.startsWith("loot-");
}

export function treasureDayKey(now: number): string {
  return `d:${dayOf(now)}`;
}

export function pickTreasure(seed: string): TreasureDef {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const total = TREASURES.reduce((sum, t) => sum + t.weight, 0);
  let roll = h % total;
  for (const item of TREASURES) {
    if (roll < item.weight) return item;
    roll -= item.weight;
  }
  return TREASURES[0]!;
}

/** Spot index 0-8 committed from challenge id (not revealed to the client). */
export function pickSpot(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 19 + seed.charCodeAt(i)) >>> 0;
  return h % TREASURE_GRID;
}

export function clueForSpot(spot: number): string {
  return DIG_CLUES[spot] ?? DIG_CLUES[0]!;
}

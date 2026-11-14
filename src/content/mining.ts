import { dayOf } from "../core";
import type { ItemRarity } from "./rarities";

export const MINING_STAMINA_MAX = 10;
export const MINING_STRIKE_MIN_MS = 1_500;
export const MINING_STRIKE_MAX_MS = 4_000;
export const MINING_STRIKE_WINDOW_MS = 2_000;

export interface OreDef {
  id: string;
  name: string;
  rarity: ItemRarity;
  rewardBoinglets: number;
  staminaCost: number;
  weight: number;
  minTier: number;
}

export interface PickaxeDef {
  id: string;
  name: string;
  tier: number;
}

export const PICKAXES: PickaxeDef[] = [
  { id: "tool-pick-wood", name: "Wood Pick", tier: 1 },
  { id: "tool-pick-iron", name: "Iron Pick", tier: 2 },
  { id: "tool-pick-crystal", name: "Crystal Pick", tier: 3 },
  { id: "tool-pick-aether", name: "Aether Pick", tier: 4 },
];

export const ORES: OreDef[] = [
  {
    id: "ore-pebble",
    name: "Lot Pebble",
    rarity: "common",
    rewardBoinglets: 4,
    staminaCost: 1,
    weight: 46,
    minTier: 1,
  },
  {
    id: "ore-spark",
    name: "Spark Ore",
    rarity: "uncommon",
    rewardBoinglets: 10,
    staminaCost: 2,
    weight: 24,
    minTier: 1,
  },
  {
    id: "ore-emberite",
    name: "Emberite",
    rarity: "rare",
    rewardBoinglets: 18,
    staminaCost: 3,
    weight: 14,
    minTier: 2,
  },
  {
    id: "ore-crystal",
    name: "Yard Crystal",
    rarity: "rare",
    rewardBoinglets: 22,
    staminaCost: 3,
    weight: 12,
    minTier: 2,
  },
  {
    id: "ore-aetherite",
    name: "Aetherite",
    rarity: "epic",
    rewardBoinglets: 36,
    staminaCost: 4,
    weight: 4,
    minTier: 3,
  },
];

export function oreById(id: string): OreDef | undefined {
  return ORES.find((o) => o.id === id);
}

export function isOreItem(itemId: string): boolean {
  return itemId.startsWith("ore-");
}

export function isPickaxeItem(itemId: string): boolean {
  return itemId.startsWith("tool-pick-");
}

export function miningDayKey(now: number): string {
  return `d:${dayOf(now)}`;
}

/** Highest owned pickaxe tier; everyone starts at wood (1). */
export function pickaxeTier(inventoryIds: string[]): number {
  let tier = 1;
  for (const pick of PICKAXES) {
    if (inventoryIds.includes(pick.id) && pick.tier > tier) tier = pick.tier;
  }
  return tier;
}

export function pickOre(seed: string, tier: number): OreDef {
  const pool = ORES.filter((o) => o.minTier <= tier);
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const total = pool.reduce((sum, o) => sum + o.weight, 0);
  let roll = h % total;
  for (const ore of pool) {
    if (roll < ore.weight) return ore;
    roll -= ore.weight;
  }
  return pool[0]!;
}

export function strikeDelayMs(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 17 + seed.charCodeAt(i)) >>> 0;
  const span = MINING_STRIKE_MAX_MS - MINING_STRIKE_MIN_MS;
  return MINING_STRIKE_MIN_MS + (h % (span + 1));
}

import { dayOf } from "../core";
import type { ItemRarity } from "./rarities";

export const FISHING_DAILY_CATCH_CAP = 3;
export const FISHING_BITE_MIN_MS = 2_000;
export const FISHING_BITE_MAX_MS = 5_000;
export const FISHING_REEL_WINDOW_MS = 2_500;

export interface FishDef {
  id: string;
  name: string;
  rarity: ItemRarity;
  rewardBoinglets: number;
  weight: number;
}

export const FISH: FishDef[] = [
  {
    id: "fish-ripple",
    name: "Curb Minnow",
    rarity: "common",
    rewardBoinglets: 4,
    weight: 48,
  },
  {
    id: "fish-boingfin",
    name: "Alleyfin",
    rarity: "uncommon",
    rewardBoinglets: 10,
    weight: 24,
  },
  {
    id: "fish-copperfin",
    name: "Copperfin",
    rarity: "uncommon",
    rewardBoinglets: 12,
    weight: 16,
  },
  {
    id: "fish-moonkoi",
    name: "Night Koi",
    rarity: "rare",
    rewardBoinglets: 22,
    weight: 9,
  },
  {
    id: "fish-starfin",
    name: "Starfin",
    rarity: "epic",
    rewardBoinglets: 34,
    weight: 3,
  },
];

export function fishById(id: string): FishDef | undefined {
  return FISH.find((f) => f.id === id);
}

export function isFishItem(itemId: string): boolean {
  return itemId.startsWith("fish-");
}

export function fishingDayKey(now: number): string {
  return `d:${dayOf(now)}`;
}

/** Deterministic catch from challenge id (anti-reroll after cast). */
export function pickFish(seed: string): FishDef {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const total = FISH.reduce((sum, f) => sum + f.weight, 0);
  let roll = h % total;
  for (const fish of FISH) {
    if (roll < fish.weight) return fish;
    roll -= fish.weight;
  }
  return FISH[0]!;
}

export function biteDelayMs(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 17 + seed.charCodeAt(i)) >>> 0;
  const span = FISHING_BITE_MAX_MS - FISHING_BITE_MIN_MS;
  return FISHING_BITE_MIN_MS + (h % (span + 1));
}

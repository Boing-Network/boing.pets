import type { ItemRarity } from "./rarities";

export const GARDEN_SLOTS = 3;
export const GARDEN_KINDS = ["plant", "water", "harvest"] as const;
export type GardenKind = (typeof GARDEN_KINDS)[number];

export interface CropDef {
  id: string;
  name: string;
  growMs: number;
  wateredGrowMs: number;
  rewardBoinglets: number;
  rarity: ItemRarity;
}

export const CROPS: CropDef[] = [
  {
    id: "crop-sprout",
    name: "Bounce Sprout",
    growMs: 60_000,
    wateredGrowMs: 30_000,
    rewardBoinglets: 6,
    rarity: "common",
  },
  {
    id: "crop-berry",
    name: "Pasture Berry",
    growMs: 90_000,
    wateredGrowMs: 45_000,
    rewardBoinglets: 10,
    rarity: "uncommon",
  },
  {
    id: "crop-honeyroot",
    name: "Honeyroot",
    growMs: 100_000,
    wateredGrowMs: 50_000,
    rewardBoinglets: 12,
    rarity: "uncommon",
  },
  {
    id: "crop-moonbloom",
    name: "Moonbloom",
    growMs: 120_000,
    wateredGrowMs: 60_000,
    rewardBoinglets: 16,
    rarity: "rare",
  },
  {
    id: "crop-starglider",
    name: "Starglider Bloom",
    growMs: 180_000,
    wateredGrowMs: 90_000,
    rewardBoinglets: 24,
    rarity: "epic",
  },
];

export function cropById(id: string): CropDef | undefined {
  return CROPS.find((c) => c.id === id);
}

export function isCropItem(itemId: string): boolean {
  return itemId.startsWith("crop-");
}

export function isGardenKind(value: unknown): value is GardenKind {
  return (
    typeof value === "string" &&
    (GARDEN_KINDS as readonly string[]).includes(value)
  );
}

export function isValidSlot(slot: unknown): boolean {
  return (
    typeof slot === "number" &&
    Number.isInteger(slot) &&
    slot >= 0 &&
    slot < GARDEN_SLOTS
  );
}

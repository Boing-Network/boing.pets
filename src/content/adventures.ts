/** Idle Adventures definitions, odds, and pure resolution. Configurable in code. */

import { ITEM_RARITIES, type ItemRarity } from "./rarities";

export const ADVENTURE_LOCATIONS = [
  {
    id: "the-drop",
    name: "The Drop",
    blurb: "Run the night counter. Watch the door. Come back with heat.",
  },
  {
    id: "the-canal",
    name: "The Canal",
    blurb: "Walk the waterfront after dark. Pull what the tide leaves.",
  },
  {
    id: "crystal-yard",
    name: "Crystal Yard",
    blurb:
      "Cut through the industrial lot. The good stones don't sit out front.",
  },
  {
    id: "dig-site",
    name: "Dig Site",
    blurb: "The construction pit after hours. Bring a light. Don't get seen.",
  },
  {
    id: "skate-park",
    name: "Skate Park",
    blurb: "Own the park until the lights die. Status is the loot.",
  },
  {
    id: "night-market",
    name: "Night Market",
    blurb: "Back stalls, no receipts. If they know your face, you pay less.",
  },
] as const;

export type AdventureLocationId = (typeof ADVENTURE_LOCATIONS)[number]["id"];

export const ADVENTURE_DURATIONS = [
  { id: "flash", name: "Flash", minutes: 15, yieldScale: 0.45 },
  { id: "block", name: "Block", minutes: 60, yieldScale: 1 },
  { id: "shift", name: "Shift", minutes: 240, yieldScale: 2.4 },
  { id: "night", name: "Night", minutes: 480, yieldScale: 3.6 },
  { id: "marathon", name: "Marathon", minutes: 1440, yieldScale: 5.5 },
] as const;

export type AdventureDurationId = (typeof ADVENTURE_DURATIONS)[number]["id"];

/** Weights per 10,000 rolls. Mythic (Grail) and Iconic (Vaulted) stay rare. */
export const ADVENTURE_RARITY_WEIGHTS: Record<ItemRarity, number> = {
  common: 5200,
  uncommon: 2800,
  rare: 1400,
  epic: 450,
  legendary: 140,
  mythic: 8,
  iconic: 2,
};

/** Misses in a row before pity forces a Legendary. Never Grail or Vaulted. */
export const ADVENTURE_PITY_CAP = 40;

export const ADVENTURE_SLOT_MILESTONES = [
  { completed: 0, slots: 1 },
  { completed: 5, slots: 2 },
  { completed: 15, slots: 3 },
  { completed: 40, slots: 4 },
] as const;

export const ADVENTURE_STARTING_SLOTS = 1;
export const ADVENTURE_MAX_SLOTS = 4;

/** Same-location repeats in a UTC day lose yield, then hard-cap. */
export const ADVENTURE_DIMINISH_PER_REPEAT = 0.18;
export const ADVENTURE_DIMINISH_FLOOR = 0.35;
export const ADVENTURE_LOCATION_DAILY_CAP = 6;

export const ADVENTURE_OUTCOMES = [
  "success",
  "partial",
  "bonus",
  "fail",
] as const;
export type AdventureOutcome = (typeof ADVENTURE_OUTCOMES)[number];

export const ADVENTURE_MATERIALS = [
  { id: "mat-scrap", name: "Street Scrap", from: ["common", "uncommon"] },
  { id: "mat-thread", name: "Wire Thread", from: ["rare", "epic"] },
  {
    id: "mat-resin",
    name: "Night Resin",
    from: ["legendary", "mythic", "iconic"],
  },
] as const;

export type AdventureStyleSnapshot = {
  cosmeticIds: string[];
  luck: number;
};

export function adventureLocationById(id: string) {
  return ADVENTURE_LOCATIONS.find((row) => row.id === id) ?? null;
}

export function adventureDurationById(id: string) {
  return ADVENTURE_DURATIONS.find((row) => row.id === id) ?? null;
}

export function durationMs(id: AdventureDurationId | string): number {
  const row = adventureDurationById(id);
  return (row?.minutes ?? 0) * 60_000;
}

export function slotsForCompletions(completed: number): number {
  let slots = ADVENTURE_STARTING_SLOTS;
  for (const row of ADVENTURE_SLOT_MILESTONES) {
    if (completed >= row.completed) slots = row.slots;
  }
  return Math.min(ADVENTURE_MAX_SLOTS, slots);
}

export function diminishingFactor(priorCompletesToday: number): number {
  if (priorCompletesToday >= ADVENTURE_LOCATION_DAILY_CAP) return 0;
  const raw = 1 - ADVENTURE_DIMINISH_PER_REPEAT * priorCompletesToday;
  return Math.max(ADVENTURE_DIMINISH_FLOOR, raw);
}

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFromParts(...parts: Array<string | number>): number {
  let h = 2166136261;
  const text = parts.join(":");
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function styleLuck(
  snapshot: AdventureStyleSnapshot | null | undefined,
): number {
  const luck = Number(snapshot?.luck);
  if (!Number.isFinite(luck)) return 0;
  return Math.max(0, Math.min(1, luck));
}

export function snapshotStyleLuck(
  cosmeticIds: string[],
): AdventureStyleSnapshot {
  const ids = [...new Set(cosmeticIds)].sort();
  const luck = Math.max(0, Math.min(1, ids.length * 0.08));
  return { cosmeticIds: ids, luck };
}

export function rollRarity(
  rng: Rng,
  pityMisses: number,
  weights: Record<ItemRarity, number> = ADVENTURE_RARITY_WEIGHTS,
): { rarity: ItemRarity; pityAfter: number; fromPity: boolean } {
  const misses = Math.max(0, Math.floor(pityMisses));
  if (misses >= ADVENTURE_PITY_CAP) {
    return { rarity: "legendary", pityAfter: 0, fromPity: true };
  }
  const rarity = weightedRarity(rng, weights);
  const premium =
    rarity === "legendary" || rarity === "mythic" || rarity === "iconic";
  return {
    rarity,
    pityAfter: premium ? 0 : misses + 1,
    fromPity: false,
  };
}

function weightedRarity(
  rng: Rng,
  weights: Record<ItemRarity, number>,
): ItemRarity {
  let total = 0;
  for (const key of ITEM_RARITIES) total += Math.max(0, weights[key] ?? 0);
  let tick = rng() * total;
  for (const key of ITEM_RARITIES) {
    tick -= Math.max(0, weights[key] ?? 0);
    if (tick <= 0) return key;
  }
  return "common";
}

export function rollOutcome(rng: Rng, luck = 0): AdventureOutcome {
  const clamped = Math.max(0, Math.min(1, luck));
  const bonus = 0.08 + clamped * 0.07;
  const fail = Math.max(0.04, 0.1 - clamped * 0.04);
  const partial = 0.22;
  const roll = rng();
  if (roll < fail) return "fail";
  if (roll < fail + partial) return "partial";
  if (roll > 1 - bonus) return "bonus";
  return "success";
}

export type AdventureLootTableItem = {
  gameItemId: string;
  rarity: ItemRarity;
};

/** Street-table loot, one item per rarity, used when a roll hits that tier. */
export const ADVENTURE_LOOT_BY_RARITY: Record<ItemRarity, string> = {
  common: "loot-pebble",
  uncommon: "loot-map-scrap",
  rare: "loot-sun-shard",
  epic: "loot-comet-bead",
  legendary: "hat-stardust",
  mythic: "grail-tag",
  iconic: "vaulted-jacket",
};

export const ADVENTURE_EXCLUSIVE_ITEMS: Record<
  string,
  { name: string; rarity: ItemRarity; tradeable: boolean }
> = {
  "grail-tag": { name: "Grail Tag", rarity: "mythic", tradeable: true },
  "vaulted-jacket": {
    name: "Vaulted Jacket",
    rarity: "iconic",
    tradeable: true,
  },
};

export function materialForRarity(rarity: ItemRarity): string {
  if (rarity === "legendary" || rarity === "mythic" || rarity === "iconic") {
    return "mat-resin";
  }
  if (rarity === "rare" || rarity === "epic") return "mat-thread";
  return "mat-scrap";
}

export function baseCredPayout(
  durationScale: number,
  outcome: AdventureOutcome,
): number {
  const outcomeScale =
    outcome === "fail"
      ? 0.15
      : outcome === "partial"
        ? 0.55
        : outcome === "bonus"
          ? 1.35
          : 1;
  return Math.max(1, Math.round(12 * durationScale * outcomeScale));
}

export function consolationCred(durationScale: number): number {
  return Math.max(1, Math.round(4 * durationScale * 0.15));
}

export type ResolvedReward = {
  kind: "item" | "currency" | "material" | "consolation";
  gameItemId?: string;
  currency?: "boinglets" | "sparkles";
  qty: number;
  rarity?: ItemRarity;
  duplicate?: boolean;
};

export function resolveAdventureRewards(input: {
  rng: Rng;
  durationScale: number;
  outcome: AdventureOutcome;
  pityMisses: number;
  ownedItemIds: ReadonlySet<string>;
  diminishing: number;
}): { rewards: ResolvedReward[]; pityAfter: number } {
  const { rng, durationScale, outcome, ownedItemIds } = input;
  const diminish = Math.max(0, input.diminishing);
  const rewards: ResolvedReward[] = [];
  if (diminish <= 0) {
    return { rewards, pityAfter: input.pityMisses };
  }
  if (outcome === "fail") {
    rewards.push({
      kind: "consolation",
      currency: "boinglets",
      qty: Math.max(1, Math.round(consolationCred(durationScale) * diminish)),
    });
    rewards.push({
      kind: "material",
      gameItemId: "mat-scrap",
      qty: 1,
      rarity: "common",
    });
    return { rewards, pityAfter: input.pityMisses + 1 };
  }

  const rolls = outcome === "bonus" ? 2 : 1;
  let pity = input.pityMisses;
  for (let i = 0; i < rolls; i++) {
    const rolled = rollRarity(rng, pity);
    pity = rolled.pityAfter;
    const itemId = ADVENTURE_LOOT_BY_RARITY[rolled.rarity];
    const qtyScale = outcome === "partial" ? 0.5 : 1;
    if (ownedItemIds.has(itemId)) {
      rewards.push({
        kind: "material",
        gameItemId: materialForRarity(rolled.rarity),
        qty: Math.max(
          1,
          Math.round(
            (rolled.rarity === "common" ? 1 : 2) * qtyScale * diminish,
          ),
        ),
        rarity: rolled.rarity,
        duplicate: true,
      });
    } else {
      rewards.push({
        kind: "item",
        gameItemId: itemId,
        qty: 1,
        rarity: rolled.rarity,
        duplicate: false,
      });
    }
  }
  const cred = Math.max(
    1,
    Math.round(baseCredPayout(durationScale, outcome) * diminish),
  );
  rewards.push({ kind: "currency", currency: "boinglets", qty: cred });
  return { rewards, pityAfter: pity };
}

export function publicAdventureRates() {
  return {
    rarities: ITEM_RARITIES.map((id) => ({
      id,
      label:
        id === "mythic"
          ? "Grail"
          : id === "iconic"
            ? "Vaulted"
            : id[0]!.toUpperCase() + id.slice(1),
      weight: ADVENTURE_RARITY_WEIGHTS[id],
    })),
    pityCap: ADVENTURE_PITY_CAP,
    pityGrants: "legendary" as const,
    noPityFor: ["mythic", "iconic"] as const,
    diminishing: {
      perRepeat: ADVENTURE_DIMINISH_PER_REPEAT,
      floor: ADVENTURE_DIMINISH_FLOOR,
      dailyCap: ADVENTURE_LOCATION_DAILY_CAP,
    },
    slots: ADVENTURE_SLOT_MILESTONES,
    locations: ADVENTURE_LOCATIONS,
    durations: ADVENTURE_DURATIONS,
  };
}

export function isAdventureLocationId(
  value: unknown,
): value is AdventureLocationId {
  return (
    typeof value === "string" &&
    ADVENTURE_LOCATIONS.some((row) => row.id === value)
  );
}

export function isAdventureDurationId(
  value: unknown,
): value is AdventureDurationId {
  return (
    typeof value === "string" &&
    ADVENTURE_DURATIONS.some((row) => row.id === value)
  );
}

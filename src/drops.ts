/** Cosmetic RNG drop table for on-chain item ids 70-76. Pure; no I/O. */

import { blake3 } from "@noble/hashes/blake3";

export const DROP_TABLE_VERSION = "drop:v1";
export const DROP_HIT_CHANCE_BPS = 1500; // 15%
export const DROP_PITY_RARE_AFTER = 40;
export const DROP_PITY_PREMIUM_AFTER = 80;
export const DROP_SOFT_PITY_RARE = 30;
export const DROP_SOFT_PITY_PREMIUM = 60;
export const DROP_MAX_PER_UTC_DAY = 5;
export const DROP_MAX_PREMIUM_PER_UTC_WEEK = 1;
export const DROP_CARE_SOURCES = ["feed", "checkin", "play", "groom"] as const;
export type DropCareSource = (typeof DROP_CARE_SOURCES)[number];

export type DropTier = "common" | "uncommon" | "rare" | "premium";

export type DropTableEntry = {
  itemId: number;
  gameItemId: string;
  name: string;
  tier: DropTier;
  /** Parts per 1000, sums to 1000. */
  weight: number;
};

export const DROP_TABLE: readonly DropTableEntry[] = [
  {
    itemId: 70,
    gameItemId: "hat-ribbon",
    name: "Pasture Ribbon",
    tier: "common",
    weight: 400,
  },
  {
    itemId: 71,
    gameItemId: "hat-antenna",
    name: "Glow Antenna",
    tier: "uncommon",
    weight: 220,
  },
  {
    itemId: 75,
    gameItemId: "furn-cushion",
    name: "Bounce Cushion",
    tier: "uncommon",
    weight: 180,
  },
  {
    itemId: 76,
    gameItemId: "furn-lamp",
    name: "Meadow Lamp",
    tier: "rare",
    weight: 100,
  },
  {
    itemId: 73,
    gameItemId: "frame-gold",
    name: "Gold Card Frame",
    tier: "rare",
    weight: 60,
  },
  {
    itemId: 72,
    gameItemId: "hat-stardust",
    name: "Stardust Halo",
    tier: "premium",
    weight: 28,
  },
  {
    itemId: 74,
    gameItemId: "frame-aurora",
    name: "Aurora Frame",
    tier: "premium",
    weight: 12,
  },
];

export type DropPityState = {
  hitsSinceRare: number;
  hitsSincePremium: number;
};

export type DropRollResult = {
  hit: boolean;
  entry: DropTableEntry | null;
  reason:
    | "miss"
    | "table"
    | "pity-rare"
    | "pity-premium"
    | "capped-day"
    | "capped-premium-downgrade";
  digestHex: string;
  tableVersion: string;
  pity: DropPityState;
};

function hexFromBytes(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function digestInt(digest: Uint8Array, offset = 0): number {
  return (
    ((digest[offset]! << 24) |
      (digest[offset + 1]! << 16) |
      (digest[offset + 2]! << 8) |
      digest[offset + 3]!) >>>
    0
  );
}

/** Auditable seed: blake3("boing.pets:drop:v1:${owner}:${source}:${day}:${nonce}"). */
export function dropDigest(input: {
  owner: string;
  source: string;
  day: string;
  nonce: string;
}): Uint8Array {
  const seed = `boing.pets:drop:v1:${input.owner}:${input.source}:${input.day}:${input.nonce}`;
  return blake3(new TextEncoder().encode(seed));
}

export function utcDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function utcWeekKey(ms: number): string {
  const d = new Date(ms);
  const tmp = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const day = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function isDropCareSource(value: string): value is DropCareSource {
  return (DROP_CARE_SOURCES as readonly string[]).includes(value);
}

function pickFromWeights(
  roll: number,
  entries: readonly DropTableEntry[],
): DropTableEntry {
  const total = entries.reduce((s, e) => s + e.weight, 0);
  let n = roll % total;
  for (const entry of entries) {
    if (n < entry.weight) return entry;
    n -= entry.weight;
  }
  return entries[entries.length - 1]!;
}

function withSoftPity(
  hitsSinceRare: number,
  hitsSincePremium: number,
): DropTableEntry[] {
  return DROP_TABLE.map((entry) => {
    let w = entry.weight;
    if (
      hitsSinceRare >= DROP_SOFT_PITY_RARE &&
      (entry.tier === "rare" || entry.tier === "premium")
    ) {
      w = Math.round(w * 1.35);
    }
    if (
      hitsSincePremium >= DROP_SOFT_PITY_PREMIUM &&
      entry.tier === "premium"
    ) {
      w = Math.round(w * 1.5);
    }
    return { ...entry, weight: w };
  });
}

/**
 * One complete drop attempt. `nonce` should be unique per attempt (challenge id).
 * Caps are applied by the caller passing current counts; this function is deterministic
 * given the same digest inputs and pity/cap context.
 */
export function rollCosmeticDrop(input: {
  owner: string;
  source: string;
  day: string;
  nonce: string;
  pity: DropPityState;
  dropsToday: number;
  premiumsThisWeek: number;
}): DropRollResult {
  const digest = dropDigest(input);
  const digestHex = hexFromBytes(digest);
  const pity = { ...input.pity };
  if (input.dropsToday >= DROP_MAX_PER_UTC_DAY) {
    return {
      hit: false,
      entry: null,
      reason: "capped-day",
      digestHex,
      tableVersion: DROP_TABLE_VERSION,
      pity,
    };
  }

  const hitRoll = digestInt(digest, 0) % 10_000;
  const forceRare = pity.hitsSinceRare + 1 >= DROP_PITY_RARE_AFTER;
  const forcePremium = pity.hitsSincePremium + 1 >= DROP_PITY_PREMIUM_AFTER;
  const hit = forceRare || forcePremium || hitRoll < DROP_HIT_CHANCE_BPS;
  if (!hit) {
    return {
      hit: false,
      entry: null,
      reason: "miss",
      digestHex,
      tableVersion: DROP_TABLE_VERSION,
      pity,
    };
  }

  const tableRoll = digestInt(digest, 4);
  let reason: DropRollResult["reason"] = "table";
  let pool: DropTableEntry[];
  if (forcePremium) {
    pool = DROP_TABLE.filter((e) => e.tier === "premium");
    reason = "pity-premium";
  } else if (forceRare) {
    pool = DROP_TABLE.filter((e) => e.tier === "rare" || e.tier === "premium");
    reason = "pity-rare";
  } else {
    pool = withSoftPity(pity.hitsSinceRare, pity.hitsSincePremium);
  }

  let entry = pickFromWeights(tableRoll, pool);
  if (
    entry.tier === "premium" &&
    input.premiumsThisWeek >= DROP_MAX_PREMIUM_PER_UTC_WEEK
  ) {
    const lower = DROP_TABLE.filter((e) => e.tier === "rare");
    entry = pickFromWeights(tableRoll, lower);
    reason = "capped-premium-downgrade";
  }

  pity.hitsSinceRare =
    entry.tier === "rare" || entry.tier === "premium"
      ? 0
      : pity.hitsSinceRare + 1;
  pity.hitsSincePremium =
    entry.tier === "premium" ? 0 : pity.hitsSincePremium + 1;

  return {
    hit: true,
    entry,
    reason,
    digestHex,
    tableVersion: DROP_TABLE_VERSION,
    pity,
  };
}

export function publicDropTable() {
  return {
    version: DROP_TABLE_VERSION,
    hitChanceBps: DROP_HIT_CHANCE_BPS,
    entries: DROP_TABLE.map((e) => ({
      itemId: e.itemId,
      gameItemId: e.gameItemId,
      name: e.name,
      tier: e.tier,
      oddsPerMille: e.weight,
    })),
    pity: {
      rareAfter: DROP_PITY_RARE_AFTER,
      premiumAfter: DROP_PITY_PREMIUM_AFTER,
      softRareFrom: DROP_SOFT_PITY_RARE,
      softPremiumFrom: DROP_SOFT_PITY_PREMIUM,
    },
    caps: {
      maxDropsPerUtcDay: DROP_MAX_PER_UTC_DAY,
      maxPremiumPerUtcWeek: DROP_MAX_PREMIUM_PER_UTC_WEEK,
    },
    sources: DROP_CARE_SOURCES,
  };
}

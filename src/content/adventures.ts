/** Idle Adventures definitions, odds, Style Luck, and pure resolution. */

import { itemRarity } from "./items";
import { ITEM_RARITIES, type ItemRarity } from "./rarities";
import { activeEvents, type SeasonEvent } from "./seasons";

export const ADVENTURE_WEIGHT_TOTAL = 1_000_000;

/**
 * Base rarity odds as integer weights per 1,000,000 so 0.01% is exact.
 * Common 65%, Uncommon 22%, Rare 9%, Epic 3%, Legendary 0.8%,
 * Mythic/Grail 0.19%, Iconic/Vaulted 0.01%.
 */
export const ADVENTURE_RARITY_WEIGHTS: Record<ItemRarity, number> = {
  common: 650_000,
  uncommon: 220_000,
  rare: 90_000,
  epic: 30_000,
  legendary: 8_000,
  mythic: 1_900,
  iconic: 100,
};

/** Hard ceilings after Style Luck and adventure bonuses. Never a guarantee. */
export const ADVENTURE_MYTHIC_CEILING_WEIGHT = 3_800; // 0.38%
export const ADVENTURE_ICONIC_CEILING_WEIGHT = 200; // 0.02%

export const STYLE_LUCK_RARITY_POINTS: Record<ItemRarity, number> = {
  common: 1,
  uncommon: 2,
  rare: 4,
  epic: 7,
  legendary: 12,
  mythic: 20,
  iconic: 20,
};

export const STYLE_LUCK_DIMINISH_AFTER = 40;
export const STYLE_LUCK_POINT_VALUE = 0.02;
export const STYLE_LUCK_POINT_VALUE_DIMINISHED = 0.008;
export const STYLE_LUCK_MULTIPLIER_CAP = 2.25;

export type AdventureItemTag =
  | "hat"
  | "accessory"
  | "jewelry"
  | "currency"
  | "shoe"
  | "jacket"
  | "backpack"
  | "xp"
  | "limited-apparel"
  | "emote"
  | "music"
  | "rare-drop"
  | "apparel"
  | "luxury"
  | "premium-material"
  | "secret"
  | "collectible"
  | "event"
  | "graffiti"
  | "nightlife"
  | "designer";

export type StyleSetId =
  "sneakerhead" | "nightlife" | "designer" | "graffiti" | "complete-collection";

export const STYLE_SETS: Record<
  StyleSetId,
  {
    name: string;
    blurb: string;
    tags: AdventureItemTag[];
    ownedNeeded: number;
    points: number;
    effect: string;
  }
> = {
  sneakerhead: {
    name: "Sneakerhead",
    blurb: "Favors shoe rewards, especially on Rooftop Sessions.",
    tags: ["shoe"],
    ownedNeeded: 2,
    points: 6,
    effect: "shoe-rewards",
  },
  nightlife: {
    name: "Nightlife",
    blurb:
      "Favors nighttime adventures: Night Market, Underground Show, Pop-Up.",
    tags: ["nightlife"],
    ownedNeeded: 2,
    points: 6,
    effect: "night-adventures",
  },
  designer: {
    name: "Designer",
    blurb: "Favors Epic and Legendary apparel.",
    tags: ["designer", "luxury"],
    ownedNeeded: 2,
    points: 8,
    effect: "epic-legendary-apparel",
  },
  graffiti: {
    name: "Graffiti",
    blurb: "Favors limited accessories.",
    tags: ["graffiti", "accessory"],
    ownedNeeded: 2,
    points: 6,
    effect: "limited-accessories",
  },
  "complete-collection": {
    name: "Complete Collection",
    blurb:
      "A small bonus to everything once every set is represented in your stash.",
    tags: [],
    ownedNeeded: 0,
    points: 5,
    effect: "global",
  },
};

export const ADVENTURE_ITEM_TAGS: Record<string, AdventureItemTag[]> = {
  "hat-ribbon": ["hat", "accessory", "graffiti"],
  "hat-antenna": ["hat", "nightlife"],
  "hat-leaf": ["hat"],
  "hat-stardust": ["hat", "nightlife"],
  "hat-comet": ["hat", "nightlife"],
  "hat-beanie": ["hat", "nightlife"],
  "frame-gold": ["accessory", "luxury", "designer"],
  "frame-aurora": ["accessory", "luxury", "designer"],
  "acc-chain": ["accessory", "jewelry", "graffiti"],
  "jewel-hoop": ["jewelry", "accessory", "nightlife"],
  "acc-luxury-clip": ["accessory", "luxury", "designer"],
  "shoe-runner": ["shoe"],
  "shoe-night": ["shoe", "nightlife"],
  "jacket-coach": ["jacket", "apparel"],
  "jacket-studio": ["jacket", "apparel", "designer", "luxury"],
  "bag-sling": ["backpack"],
  "apparel-bootleg-tee": ["limited-apparel", "apparel", "graffiti"],
  "emote-crowd-surf": ["emote"],
  "music-bootleg": ["music"],
  "grail-tag": ["accessory", "graffiti", "secret", "collectible"],
  "vaulted-jacket": ["jacket", "apparel", "designer", "luxury", "secret"],
  "secret-stencil": ["secret", "collectible", "graffiti"],
  "collectible-lost-card": ["secret", "collectible"],
  "popup-guest-pass": ["event", "collectible"],
  "popup-tour-patch": ["event", "accessory", "limited-apparel"],
  "mat-scrap": ["premium-material"],
  "mat-thread": ["premium-material"],
  "mat-resin": ["premium-material"],
};

export const ADVENTURE_EXCLUSIVE_ITEMS: Record<
  string,
  {
    name: string;
    rarity: ItemRarity;
    tradeable: boolean;
    tags: AdventureItemTag[];
  }
> = {
  "hat-beanie": {
    name: "Night Beanie",
    rarity: "uncommon",
    tradeable: true,
    tags: ["hat", "nightlife"],
  },
  "acc-chain": {
    name: "Curb Chain",
    rarity: "rare",
    tradeable: true,
    tags: ["accessory", "jewelry", "graffiti"],
  },
  "jewel-hoop": {
    name: "Signal Hoops",
    rarity: "epic",
    tradeable: true,
    tags: ["jewelry", "accessory", "nightlife"],
  },
  "shoe-runner": {
    name: "Roof Runners",
    rarity: "uncommon",
    tradeable: true,
    tags: ["shoe"],
  },
  "shoe-night": {
    name: "After-Hours Kicks",
    rarity: "rare",
    tradeable: true,
    tags: ["shoe", "nightlife"],
  },
  "jacket-coach": {
    name: "Session Jacket",
    rarity: "rare",
    tradeable: true,
    tags: ["jacket", "apparel"],
  },
  "bag-sling": {
    name: "Block Sling",
    rarity: "uncommon",
    tradeable: true,
    tags: ["backpack"],
  },
  "apparel-bootleg-tee": {
    name: "Bootleg Tee",
    rarity: "epic",
    tradeable: true,
    tags: ["limited-apparel", "apparel", "graffiti"],
  },
  "emote-crowd-surf": {
    name: "Crowd Surf Emote",
    rarity: "rare",
    tradeable: true,
    tags: ["emote"],
  },
  "music-bootleg": {
    name: "Bootleg Track",
    rarity: "epic",
    tradeable: true,
    tags: ["music"],
  },
  "jacket-studio": {
    name: "Atelier Jacket",
    rarity: "legendary",
    tradeable: true,
    tags: ["jacket", "apparel", "designer", "luxury"],
  },
  "acc-luxury-clip": {
    name: "Vault Clip",
    rarity: "epic",
    tradeable: true,
    tags: ["accessory", "luxury", "designer"],
  },
  "secret-stencil": {
    name: "Lost Stencil",
    rarity: "legendary",
    tradeable: true,
    tags: ["secret", "collectible", "graffiti"],
  },
  "collectible-lost-card": {
    name: "Lost Drop Card",
    rarity: "epic",
    tradeable: true,
    tags: ["secret", "collectible"],
  },
  "grail-tag": {
    name: "Grail Tag",
    rarity: "mythic",
    tradeable: true,
    tags: ["accessory", "graffiti", "secret", "collectible"],
  },
  "vaulted-jacket": {
    name: "Vaulted Jacket",
    rarity: "iconic",
    tradeable: true,
    tags: ["jacket", "apparel", "designer", "luxury", "secret"],
  },
  "popup-guest-pass": {
    name: "Pop-Up Guest Pass",
    rarity: "rare",
    tradeable: true,
    tags: ["event", "collectible"],
  },
  "popup-tour-patch": {
    name: "Tour Patch",
    rarity: "epic",
    tradeable: true,
    tags: ["event", "accessory", "limited-apparel"],
  },
};

export const ADVENTURE_LOCATIONS = [
  {
    id: "night-market",
    name: "The Night Market",
    blurb:
      "Back stalls after midnight. Hats, ice, and street Cred changing hands.",
    theme: "accessories, hats, jewelry, and streetwear currency",
    tags: ["nightlife", "accessory", "hat", "jewelry", "currency"] as const,
    night: true,
    unlockCompletions: 0,
    fullTableCompletions: 0,
    requiresEvent: false,
  },
  {
    id: "rooftop-sessions",
    name: "Rooftop Sessions",
    blurb: "The roof until the skyline fades. Kicks, jackets, bags, and XP.",
    theme: "sneakers, jackets, backpacks, and XP",
    tags: ["shoe", "jacket", "backpack", "xp"] as const,
    night: false,
    unlockCompletions: 0,
    fullTableCompletions: 0,
    requiresEvent: false,
  },
  {
    id: "underground-show",
    name: "Underground Show",
    blurb: "No signage, one door. Limited apparel, emotes, and bootleg heat.",
    theme: "limited apparel, emotes, music cosmetics, and rare drops",
    tags: [
      "limited-apparel",
      "emote",
      "music",
      "rare-drop",
      "nightlife",
    ] as const,
    night: true,
    unlockCompletions: 0,
    fullTableCompletions: 0,
    requiresEvent: false,
  },
  {
    id: "designer-district",
    name: "Designer District",
    blurb:
      "Appointment only. High-tier cloth, luxury ice, and premium materials.",
    theme: "high-tier clothing, luxury accessories, and premium materials",
    tags: ["apparel", "luxury", "designer", "premium-material"] as const,
    night: false,
    unlockCompletions: 0,
    fullTableCompletions: 0,
    requiresEvent: false,
  },
  {
    id: "the-lost-drop",
    name: "The Lost Drop",
    blurb:
      "The map stops here. Secret collectibles, unlocked one rumor at a time.",
    theme:
      "extremely rare cosmetics and secret collectibles; unlocks gradually",
    tags: ["secret", "collectible"] as const,
    night: false,
    unlockCompletions: 5,
    fullTableCompletions: 15,
    requiresEvent: false,
  },
  {
    id: "worldwide-pop-up",
    name: "Worldwide Pop-Up",
    blurb:
      "It is only here while the overlay is live. Event-only rewards, rotating stock.",
    theme: "rotating limited-time event rewards via the seasons/event overlay",
    tags: ["event"] as const,
    night: true,
    unlockCompletions: 0,
    fullTableCompletions: 0,
    requiresEvent: true,
  },
] as const;

export type AdventureLocationId = (typeof ADVENTURE_LOCATIONS)[number]["id"];

/**
 * Five durations. Longer trips pay more and tilt rarer, but failure is never harsher
 * than the 45-minute low-risk run. The longform slot is 3 days, or the live event
 * window when launched as a Pop-Up.
 */
export const ADVENTURE_DURATIONS = [
  {
    id: "quick",
    name: "45-Minute Run",
    minutes: 45,
    yieldScale: 0.55,
    risk: "low",
    blurb: "Low risk, smaller rewards.",
    failScale: 0.7,
    rarityTilt: {
      uncommon: 1,
      rare: 0.85,
      epic: 0.8,
      legendary: 0.75,
      mythic: 0.7,
      iconic: 0.7,
    },
  },
  {
    id: "session",
    name: "3-Hour Session",
    minutes: 180,
    yieldScale: 1.4,
    risk: "medium",
    blurb: "Medium risk, better Uncommon results.",
    failScale: 1,
    rarityTilt: {
      uncommon: 1.35,
      rare: 1,
      epic: 1,
      legendary: 1,
      mythic: 1,
      iconic: 1,
    },
  },
  {
    id: "overnight",
    name: "Overnight",
    minutes: 480,
    yieldScale: 2.8,
    risk: "medium",
    blurb: "Strong overnight take.",
    failScale: 1,
    rarityTilt: {
      uncommon: 1.15,
      rare: 1.15,
      epic: 1.15,
      legendary: 1.1,
      mythic: 1.05,
      iconic: 1.05,
    },
  },
  {
    id: "daylong",
    name: "1-Day Run",
    minutes: 1_440,
    yieldScale: 4.2,
    risk: "medium",
    blurb: "High value, more rare cosmetics.",
    failScale: 1,
    rarityTilt: {
      uncommon: 1,
      rare: 1.45,
      epic: 1.4,
      legendary: 1.3,
      mythic: 1.1,
      iconic: 1.1,
    },
  },
  {
    id: "longform",
    name: "3-Day or Event",
    minutes: 4_320,
    yieldScale: 6.5,
    risk: "medium",
    blurb:
      "Very high value, with event-exclusive access when a pop-up is live.",
    failScale: 1,
    eventExclusiveAccess: true,
    rarityTilt: {
      uncommon: 1.05,
      rare: 1.5,
      epic: 1.45,
      legendary: 1.35,
      mythic: 1.15,
      iconic: 1.15,
    },
  },
] as const;

export type AdventureDurationId = (typeof ADVENTURE_DURATIONS)[number]["id"];

export const ADVENTURE_PITY_CAP = 40;

export const ADVENTURE_SLOT_MILESTONES = [
  { completed: 0, slots: 1 },
  { completed: 5, slots: 2 },
  { completed: 15, slots: 3 },
  { completed: 40, slots: 4 },
] as const;

export const ADVENTURE_STARTING_SLOTS = 1;
export const ADVENTURE_MAX_SLOTS = 4;

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

export type CharacterStage =
  "egg" | "baby" | "child" | "teen" | "adult" | "elder";

export const STAGE_SUCCESS_BONUS: Record<CharacterStage, number> = {
  egg: 0,
  baby: 0,
  child: 0.02,
  teen: 0.04,
  adult: 0.06,
  elder: 0.07,
};

export type AdventureStyleSnapshot = {
  cosmeticIds: string[];
  ownedItemIds: string[];
  points: number;
  rawPoints: number;
  multiplier: number;
  sets: StyleSetId[];
  eventIds: string[];
  eventTags: string[];
  stage: CharacterStage;
  xp: number;
  adventureBonus: number;
  luck: number;
};

export type LootEntry = {
  gameItemId: string;
  rarity: ItemRarity;
  tags: AdventureItemTag[];
  eventId?: string;
  fullTableOnly?: boolean;
};

const locLoot = (
  rows: Array<
    [
      string,
      ItemRarity,
      AdventureItemTag[],
      { eventId?: string; fullTableOnly?: boolean }?,
    ]
  >,
): LootEntry[] =>
  rows.map(([gameItemId, rarity, tags, extra]) => ({
    gameItemId,
    rarity,
    tags,
    ...extra,
  }));

export const ADVENTURE_LOOT_TABLES: Record<AdventureLocationId, LootEntry[]> = {
  "night-market": locLoot([
    ["acc-chain", "rare", ["accessory", "jewelry", "graffiti"]],
    ["hat-beanie", "uncommon", ["hat", "nightlife"]],
    ["hat-ribbon", "common", ["hat", "accessory", "graffiti"]],
    ["hat-antenna", "uncommon", ["hat", "nightlife"]],
    ["jewel-hoop", "epic", ["jewelry", "accessory", "nightlife"]],
    ["hat-stardust", "legendary", ["hat", "nightlife"]],
    ["grail-tag", "mythic", ["accessory", "graffiti", "secret"]],
  ]),
  "rooftop-sessions": locLoot([
    ["shoe-runner", "uncommon", ["shoe"]],
    ["shoe-night", "rare", ["shoe", "nightlife"]],
    ["jacket-coach", "rare", ["jacket", "apparel"]],
    ["bag-sling", "uncommon", ["backpack"]],
    ["jacket-studio", "legendary", ["jacket", "apparel", "designer"]],
    ["vaulted-jacket", "iconic", ["jacket", "apparel", "designer", "luxury"]],
  ]),
  "underground-show": locLoot([
    ["apparel-bootleg-tee", "epic", ["limited-apparel", "apparel", "graffiti"]],
    ["emote-crowd-surf", "rare", ["emote"]],
    ["music-bootleg", "epic", ["music"]],
    ["hat-comet", "epic", ["hat", "nightlife"]],
    ["loot-comet-bead", "epic", ["rare-drop"]],
    ["loot-sun-shard", "rare", ["rare-drop"]],
    ["grail-tag", "mythic", ["accessory", "secret"]],
  ]),
  "designer-district": locLoot([
    ["jacket-studio", "legendary", ["jacket", "apparel", "designer", "luxury"]],
    ["acc-luxury-clip", "epic", ["accessory", "luxury", "designer"]],
    ["frame-aurora", "legendary", ["accessory", "luxury", "designer"]],
    ["frame-gold", "rare", ["accessory", "luxury", "designer"]],
    ["mat-resin", "legendary", ["premium-material"]],
    ["mat-thread", "rare", ["premium-material"]],
    ["vaulted-jacket", "iconic", ["jacket", "apparel", "designer", "luxury"]],
  ]),
  "the-lost-drop": locLoot([
    ["collectible-lost-card", "epic", ["secret", "collectible"]],
    [
      "secret-stencil",
      "legendary",
      ["secret", "collectible", "graffiti"],
      { fullTableOnly: true },
    ],
    ["grail-tag", "mythic", ["secret", "collectible"], { fullTableOnly: true }],
    [
      "vaulted-jacket",
      "iconic",
      ["secret", "apparel", "designer"],
      { fullTableOnly: true },
    ],
    ["loot-map-scrap", "uncommon", ["collectible"]],
    ["loot-wind-bell", "rare", ["collectible"]],
  ]),
  "worldwide-pop-up": locLoot([
    ["popup-guest-pass", "rare", ["event", "collectible"]],
    ["popup-tour-patch", "epic", ["event", "accessory"]],
    ["hat-antenna", "uncommon", ["hat", "event"]],
  ]),
};

export function adventureLocationById(id: string) {
  return ADVENTURE_LOCATIONS.find((row) => row.id === id) ?? null;
}

export function adventureDurationById(id: string) {
  return ADVENTURE_DURATIONS.find((row) => row.id === id) ?? null;
}

export function durationMs(
  id: AdventureDurationId | string,
  now = Date.now(),
  locationId?: string,
): number {
  const row = adventureDurationById(id);
  if (!row) return 0;
  let ms = row.minutes * 60_000;
  if (row.id === "longform" && locationId === "worldwide-pop-up") {
    const events = activeEvents(now);
    if (events.length) {
      const remaining = Math.max(...events.map((event) => event.endsAt)) - now;
      ms = Math.max(45 * 60_000, Math.min(ms, remaining));
    }
  }
  return ms;
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

export function tagsForItem(gameItemId: string): AdventureItemTag[] {
  return (
    ADVENTURE_ITEM_TAGS[gameItemId] ??
    ADVENTURE_EXCLUSIVE_ITEMS[gameItemId]?.tags ??
    []
  );
}

export function styleLuckMultiplierFromPoints(rawPoints: number): {
  points: number;
  multiplier: number;
} {
  const raw = Math.max(0, rawPoints);
  const head = Math.min(raw, STYLE_LUCK_DIMINISH_AFTER);
  const tail = Math.max(0, raw - STYLE_LUCK_DIMINISH_AFTER);
  const unclamped =
    1 +
    head * STYLE_LUCK_POINT_VALUE +
    tail * STYLE_LUCK_POINT_VALUE_DIMINISHED;
  const multiplier = Math.min(STYLE_LUCK_MULTIPLIER_CAP, unclamped);
  return { points: raw, multiplier };
}

function itemMatchesSet(itemId: string, setId: StyleSetId): boolean {
  const tags = tagsForItem(itemId);
  const needed = STYLE_SETS[setId].tags;
  return needed.some((tag) => tags.includes(tag));
}

export function detectStyleSets(ownedItemIds: readonly string[]): StyleSetId[] {
  const owned = [...new Set(ownedItemIds)];
  const active: StyleSetId[] = [];
  const core: StyleSetId[] = [
    "sneakerhead",
    "nightlife",
    "designer",
    "graffiti",
  ];
  for (const id of core) {
    const count = owned.filter((item) => itemMatchesSet(item, id)).length;
    if (count >= STYLE_SETS[id].ownedNeeded) active.push(id);
  }
  if (core.every((id) => active.includes(id)))
    active.push("complete-collection");
  return active;
}

export function adventureCompatibilityBonus(
  locationId: string,
  durationId: string,
  sets: readonly StyleSetId[],
  eventIds: readonly string[] = [],
): number {
  const location = adventureLocationById(locationId);
  let bonus = 1;
  if (sets.includes("nightlife") && location?.night) bonus *= 1.15;
  if (sets.includes("sneakerhead") && locationId === "rooftop-sessions")
    bonus *= 1.12;
  if (sets.includes("designer") && locationId === "designer-district")
    bonus *= 1.12;
  if (sets.includes("graffiti") && locationId === "underground-show")
    bonus *= 1.1;
  if (sets.includes("complete-collection")) bonus *= 1.05;
  if (eventIds.length && locationId === "worldwide-pop-up") bonus *= 1.1;
  if (sets.includes("nightlife") && durationId === "overnight") bonus *= 1.05;
  return bonus;
}

export function snapshotStyleLuck(input: {
  equippedIds?: readonly string[];
  ownedItemIds?: readonly string[];
  stage?: CharacterStage;
  xp?: number;
  now?: number;
  locationId?: string;
  durationId?: string;
}): AdventureStyleSnapshot {
  const equipped = [...new Set(input.equippedIds ?? [])].sort();
  const owned = [...new Set(input.ownedItemIds ?? equipped)].sort();
  let rawPoints = 0;
  for (const id of equipped) {
    const rarity =
      ADVENTURE_EXCLUSIVE_ITEMS[id]?.rarity ?? itemRarity(id) ?? "common";
    rawPoints += STYLE_LUCK_RARITY_POINTS[rarity] ?? 0;
  }
  const sets = detectStyleSets(owned);
  for (const id of sets) rawPoints += STYLE_SETS[id].points;
  const events = activeEvents(input.now ?? Date.now());
  const eventIds = events.map((event) => event.id);
  const eventTags = events.flatMap((event) => event.limitedCosmetics);
  if (equipped.some((id) => eventTags.includes(id))) rawPoints += 4;
  const { points, multiplier } = styleLuckMultiplierFromPoints(rawPoints);
  const adventureBonus = adventureCompatibilityBonus(
    input.locationId ?? "",
    input.durationId ?? "",
    sets,
    eventIds,
  );
  return {
    cosmeticIds: equipped,
    ownedItemIds: owned,
    points,
    rawPoints,
    multiplier,
    sets,
    eventIds,
    eventTags,
    stage: input.stage ?? "baby",
    xp: Math.max(0, Math.floor(input.xp ?? 0)),
    adventureBonus,
    luck: multiplier,
  };
}

export function styleLuck(
  snapshot: AdventureStyleSnapshot | null | undefined,
): number {
  const value = Number(snapshot?.multiplier ?? snapshot?.luck);
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(STYLE_LUCK_MULTIPLIER_CAP, value));
}

export function tiltWeights(
  tilt: Partial<Record<ItemRarity, number>> | undefined,
): Record<ItemRarity, number> {
  const out = { ...ADVENTURE_RARITY_WEIGHTS };
  if (!tilt) return out;
  for (const rarity of ITEM_RARITIES) {
    if (rarity === "common") continue;
    out[rarity] = Math.max(0, Math.round(out[rarity] * (tilt[rarity] ?? 1)));
  }
  const used = ITEM_RARITIES.filter((rarity) => rarity !== "common").reduce(
    (sum, rarity) => sum + out[rarity],
    0,
  );
  out.common = Math.max(0, ADVENTURE_WEIGHT_TOTAL - used);
  return out;
}

export function effectiveRarityWeights(input: {
  durationId?: string;
  luckMultiplier?: number;
  adventureBonus?: number;
  sets?: readonly StyleSetId[];
  locationId?: string;
}): Record<ItemRarity, number> {
  const duration = input.durationId
    ? adventureDurationById(input.durationId)
    : null;
  const base = tiltWeights(duration?.rarityTilt);
  const scale =
    Math.max(1, input.luckMultiplier ?? 1) * (input.adventureBonus ?? 1);
  const out = { ...base };
  const sets = input.sets ?? [];
  for (const rarity of ITEM_RARITIES) {
    if (rarity === "common") continue;
    let local = scale;
    if (
      sets.includes("designer") &&
      (rarity === "epic" || rarity === "legendary") &&
      (input.locationId === "designer-district" || !input.locationId)
    ) {
      local *= 1.2;
    }
    out[rarity] = Math.max(0, Math.round(base[rarity] * local));
  }
  out.mythic = Math.min(out.mythic, ADVENTURE_MYTHIC_CEILING_WEIGHT);
  out.iconic = Math.min(out.iconic, ADVENTURE_ICONIC_CEILING_WEIGHT);
  const used = ITEM_RARITIES.filter((rarity) => rarity !== "common").reduce(
    (sum, rarity) => sum + out[rarity],
    0,
  );
  out.common = Math.max(0, ADVENTURE_WEIGHT_TOTAL - used);
  return out;
}

export function weightsToChances(
  weights: Record<ItemRarity, number>,
): Record<ItemRarity, number> {
  const total =
    ITEM_RARITIES.reduce(
      (sum, rarity) => sum + Math.max(0, weights[rarity]),
      0,
    ) || 1;
  const out = { ...ADVENTURE_RARITY_WEIGHTS };
  for (const rarity of ITEM_RARITIES) out[rarity] = weights[rarity] / total;
  return out;
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

export type OutcomeChances = Record<AdventureOutcome, number>;

export function outcomeChances(input: {
  durationId?: string;
  stage?: CharacterStage;
  xp?: number;
  luckMultiplier?: number;
  requirementsMet?: boolean;
  eventActive?: boolean;
}): OutcomeChances {
  const duration = input.durationId
    ? adventureDurationById(input.durationId)
    : null;
  const failScale = duration?.failScale ?? 1;
  // 45-minute runs are low risk; longer trips never raise fail above that base.
  let fail = 0.08 * failScale;
  let partial = 0.2;
  let bonus = 0.08;
  fail -= STAGE_SUCCESS_BONUS[input.stage ?? "baby"] * 0.5;
  bonus += STAGE_SUCCESS_BONUS[input.stage ?? "baby"] * 0.4;
  const xpBoost = Math.min(0.05, ((input.xp ?? 0) / 2_000) * 0.05);
  fail -= xpBoost * 0.5;
  bonus += xpBoost * 0.4;
  const luckBoost = Math.min(
    0.04,
    Math.max(0, (input.luckMultiplier ?? 1) - 1) * 0.04,
  );
  fail -= luckBoost * 0.5;
  bonus += luckBoost * 0.5;
  if (input.eventActive) {
    fail -= 0.015;
    bonus += 0.02;
  }
  if (input.requirementsMet === false) {
    fail += 0.08;
    bonus = Math.max(0.02, bonus - 0.04);
  }
  fail = Math.max(0.02, Math.min(0.2, fail));
  bonus = Math.max(0.04, Math.min(0.18, bonus));
  partial = Math.max(0.12, Math.min(0.28, partial));
  const rest = 1 - fail - partial - bonus;
  const success = Math.max(0.4, rest);
  const scale = fail + partial + success + bonus;
  return {
    fail: fail / scale,
    partial: partial / scale,
    success: success / scale,
    bonus: bonus / scale,
  };
}

export function rollOutcome(
  rng: Rng,
  chances: OutcomeChances | number = outcomeChances({}),
): AdventureOutcome {
  const odds =
    typeof chances === "number"
      ? outcomeChances({ luckMultiplier: 1 + chances })
      : chances;
  const roll = rng();
  if (roll < odds.fail) return "fail";
  if (roll < odds.fail + odds.partial) return "partial";
  if (roll < odds.fail + odds.partial + odds.success) return "success";
  return "bonus";
}

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
      ? 0.2
      : outcome === "partial"
        ? 0.55
        : outcome === "bonus"
          ? 1.35
          : 1;
  return Math.max(1, Math.round(12 * durationScale * outcomeScale));
}

export function consolationCred(durationScale: number): number {
  // Longer trips stay generous on a fail so they never feel harsher than a short run.
  return Math.max(2, Math.round(6 * durationScale * 0.25));
}

export function baseXpPayout(
  durationScale: number,
  outcome: AdventureOutcome,
): number {
  if (outcome === "fail") return Math.max(1, Math.round(3 * durationScale));
  const scale = outcome === "partial" ? 0.5 : outcome === "bonus" ? 1.35 : 1;
  return Math.max(2, Math.round(8 * durationScale * scale));
}

export type ResolvedReward = {
  kind: "item" | "currency" | "material" | "consolation" | "xp";
  gameItemId?: string;
  currency?: "boinglets" | "sparkles";
  qty: number;
  rarity?: ItemRarity;
  duplicate?: boolean;
};

export function lootForLocation(
  locationId: string,
  opts: {
    now?: number;
    completions?: number;
    eventExclusiveAccess?: boolean;
  } = {},
): LootEntry[] {
  const location = adventureLocationById(locationId);
  if (!location) return [];
  const completions = opts.completions ?? 0;
  const full = completions >= location.fullTableCompletions;
  let rows = (ADVENTURE_LOOT_TABLES[location.id] ?? []).filter(
    (row) => full || !row.fullTableOnly,
  );
  if (location.id === "worldwide-pop-up") {
    const events = activeEvents(opts.now ?? Date.now());
    const extras: LootEntry[] = [];
    for (const event of events) {
      for (const id of event.limitedCosmetics) {
        extras.push({
          gameItemId: id,
          rarity: itemRarity(id) ?? "uncommon",
          tags: ["event", ...tagsForItem(id)],
          eventId: event.id,
        });
      }
    }
    rows = [...rows, ...extras];
    if (!opts.eventExclusiveAccess) {
      rows = rows.filter(
        (row) => row.rarity !== "mythic" && row.rarity !== "iconic",
      );
    }
  }
  return rows;
}

function pickLoot(
  entries: LootEntry[],
  rarity: ItemRarity,
  sets: readonly StyleSetId[],
  rng: Rng,
): LootEntry | null {
  let pool = entries.filter((row) => row.rarity === rarity);
  if (!pool.length) {
    const fallback = ITEM_RARITIES.slice(
      0,
      ITEM_RARITIES.indexOf(rarity) + 1,
    ).reverse();
    for (const next of fallback) {
      pool = entries.filter((row) => row.rarity === next);
      if (pool.length) break;
    }
  }
  if (!pool.length) return null;
  if (
    sets.includes("sneakerhead") &&
    pool.some((row) => row.tags.includes("shoe"))
  ) {
    pool = [...pool, ...pool.filter((row) => row.tags.includes("shoe"))];
  }
  if (
    sets.includes("graffiti") &&
    pool.some(
      (row) => row.tags.includes("accessory") || row.tags.includes("graffiti"),
    )
  ) {
    pool = [
      ...pool,
      ...pool.filter(
        (row) =>
          row.tags.includes("accessory") || row.tags.includes("graffiti"),
      ),
    ];
  }
  return pool[Math.floor(rng() * pool.length)] ?? pool[0] ?? null;
}

export function resolveAdventureRewards(input: {
  rng: Rng;
  durationScale: number;
  durationId?: string;
  locationId?: string;
  outcome: AdventureOutcome;
  pityMisses: number;
  ownedItemIds: ReadonlySet<string>;
  diminishing: number;
  weights?: Record<ItemRarity, number>;
  sets?: readonly StyleSetId[];
  completions?: number;
  now?: number;
  eventExclusiveAccess?: boolean;
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
    rewards.push({
      kind: "xp",
      qty: baseXpPayout(durationScale, "fail"),
    });
    return { rewards, pityAfter: input.pityMisses + 1 };
  }

  const table = lootForLocation(input.locationId ?? "", {
    now: input.now,
    completions: input.completions,
    eventExclusiveAccess: input.eventExclusiveAccess,
  });
  const rolls = outcome === "bonus" ? 2 : 1;
  let pity = input.pityMisses;
  const weights = input.weights ?? ADVENTURE_RARITY_WEIGHTS;
  for (let i = 0; i < rolls; i++) {
    const rolled = rollRarity(rng, pity, weights);
    pity = rolled.pityAfter;
    const entry = pickLoot(table, rolled.rarity, input.sets ?? [], rng);
    const qtyScale = outcome === "partial" ? 0.5 : 1;
    if (!entry) {
      rewards.push({
        kind: "material",
        gameItemId: materialForRarity(rolled.rarity),
        qty: Math.max(1, Math.round(2 * qtyScale * diminish)),
        rarity: rolled.rarity,
      });
      continue;
    }
    if (ownedItemIds.has(entry.gameItemId)) {
      rewards.push({
        kind: "material",
        gameItemId: materialForRarity(entry.rarity),
        qty: Math.max(
          1,
          Math.round((entry.rarity === "common" ? 1 : 2) * qtyScale * diminish),
        ),
        rarity: entry.rarity,
        duplicate: true,
      });
    } else {
      rewards.push({
        kind: "item",
        gameItemId: entry.gameItemId,
        qty: 1,
        rarity: entry.rarity,
        duplicate: false,
      });
    }
  }
  const cred = Math.max(
    1,
    Math.round(baseCredPayout(durationScale, outcome) * diminish),
  );
  rewards.push({ kind: "currency", currency: "boinglets", qty: cred });
  if (input.locationId === "night-market") {
    rewards.push({
      kind: "currency",
      currency: "sparkles",
      qty: Math.max(1, Math.round(2 * durationScale * diminish)),
    });
  }
  const xp = baseXpPayout(durationScale, outcome);
  if (xp > 0 && (input.locationId === "rooftop-sessions" || xp > 0)) {
    rewards.push({ kind: "xp", qty: xp });
  }
  return { rewards, pityAfter: pity };
}

export function locationAvailability(
  locationId: string,
  input: { completions?: number; now?: number; events?: SeasonEvent[] },
): {
  available: boolean;
  reason: string | null;
  unlocked: boolean;
  fullTable: boolean;
} {
  const location = adventureLocationById(locationId);
  if (!location)
    return {
      available: false,
      reason: "Unknown location",
      unlocked: false,
      fullTable: false,
    };
  const completions = input.completions ?? 0;
  const events = input.events ?? activeEvents(input.now ?? Date.now());
  if (location.requiresEvent && events.length === 0) {
    return {
      available: false,
      reason:
        "Worldwide Pop-Up is dark until a seasonal event overlay is live.",
      unlocked: false,
      fullTable: false,
    };
  }
  if (completions < location.unlockCompletions) {
    return {
      available: false,
      reason: `The Lost Drop unlocks after ${location.unlockCompletions} completed runs.`,
      unlocked: false,
      fullTable: false,
    };
  }
  return {
    available: true,
    reason: null,
    unlocked: true,
    fullTable: completions >= location.fullTableCompletions,
  };
}

export type AdventurePreview = {
  locationId: AdventureLocationId | string;
  durationId: AdventureDurationId | string;
  available: boolean;
  lockedReason: string | null;
  requirements: { met: boolean; detail: string };
  styleLuck: {
    rawPoints: number;
    points: number;
    multiplier: number;
    cap: number;
    diminishAfter: number;
    sets: StyleSetId[];
    eventIds: string[];
    adventureBonus: number;
    mythicCeiling: number;
    iconicCeiling: number;
  };
  diminishing: number;
  outcomes: OutcomeChances;
  rarities: Array<{ id: ItemRarity; weight: number; chance: number }>;
  yieldScale: number;
  endsInMs: number;
};

export function estimateAdventure(input: {
  locationId: string;
  durationId: string;
  snapshot: AdventureStyleSnapshot;
  completions?: number;
  priorCompletesToday?: number;
  now?: number;
}): AdventurePreview {
  const now = input.now ?? Date.now();
  const access = locationAvailability(input.locationId, {
    completions: input.completions,
    now,
  });
  const duration = adventureDurationById(input.durationId);
  const snapshot = {
    ...input.snapshot,
    adventureBonus: adventureCompatibilityBonus(
      input.locationId,
      input.durationId,
      input.snapshot.sets,
      input.snapshot.eventIds,
    ),
  };
  const weights = effectiveRarityWeights({
    durationId: input.durationId,
    luckMultiplier: snapshot.multiplier,
    adventureBonus: snapshot.adventureBonus,
    sets: snapshot.sets,
    locationId: input.locationId,
  });
  const chances = weightsToChances(weights);
  const outcomes = outcomeChances({
    durationId: input.durationId,
    stage: snapshot.stage,
    xp: snapshot.xp,
    luckMultiplier: snapshot.multiplier,
    requirementsMet: access.available,
    eventActive: snapshot.eventIds.length > 0,
  });
  return {
    locationId: input.locationId,
    durationId: input.durationId,
    available: access.available,
    lockedReason: access.reason,
    requirements: {
      met: access.available,
      detail: access.reason ?? "Ready to dispatch.",
    },
    styleLuck: {
      rawPoints: snapshot.rawPoints,
      points: snapshot.points,
      multiplier: snapshot.multiplier,
      cap: STYLE_LUCK_MULTIPLIER_CAP,
      diminishAfter: STYLE_LUCK_DIMINISH_AFTER,
      sets: snapshot.sets,
      eventIds: snapshot.eventIds,
      adventureBonus: snapshot.adventureBonus,
      mythicCeiling: ADVENTURE_MYTHIC_CEILING_WEIGHT / ADVENTURE_WEIGHT_TOTAL,
      iconicCeiling: ADVENTURE_ICONIC_CEILING_WEIGHT / ADVENTURE_WEIGHT_TOTAL,
    },
    diminishing: diminishingFactor(input.priorCompletesToday ?? 0),
    outcomes,
    rarities: ITEM_RARITIES.map((id) => ({
      id,
      weight: weights[id],
      chance: chances[id],
    })),
    yieldScale: duration?.yieldScale ?? 1,
    endsInMs: durationMs(input.durationId, now, input.locationId),
  };
}

export function publicAdventureRates() {
  return {
    source: "dispatch-station",
    note: "Adventures are off-map trips launched from the Dispatch station. City stations are not adventure locations.",
    rarities: ITEM_RARITIES.map((id) => ({
      id,
      label:
        id === "mythic"
          ? "Grail"
          : id === "iconic"
            ? "Vaulted"
            : id[0]!.toUpperCase() + id.slice(1),
      weight: ADVENTURE_RARITY_WEIGHTS[id],
      chance: ADVENTURE_RARITY_WEIGHTS[id] / ADVENTURE_WEIGHT_TOTAL,
    })),
    weightTotal: ADVENTURE_WEIGHT_TOTAL,
    pityCap: ADVENTURE_PITY_CAP,
    pityGrants: "legendary" as const,
    noPityFor: ["mythic", "iconic"] as const,
    styleLuckNeverGuarantees: ["mythic", "iconic"] as const,
    mythicCeiling: ADVENTURE_MYTHIC_CEILING_WEIGHT / ADVENTURE_WEIGHT_TOTAL,
    iconicCeiling: ADVENTURE_ICONIC_CEILING_WEIGHT / ADVENTURE_WEIGHT_TOTAL,
    styleLuck: {
      rarityPoints: STYLE_LUCK_RARITY_POINTS,
      diminishAfter: STYLE_LUCK_DIMINISH_AFTER,
      pointValue: STYLE_LUCK_POINT_VALUE,
      diminishedPointValue: STYLE_LUCK_POINT_VALUE_DIMINISHED,
      multiplierCap: STYLE_LUCK_MULTIPLIER_CAP,
      formula:
        "final chance = base × Style Luck multiplier × adventure bonus, then Mythic/Iconic are capped. Pity never grants Mythic or Iconic.",
      sets: Object.entries(STYLE_SETS).map(([id, row]) => ({
        id,
        ...row,
      })),
    },
    successFactors: [
      "character growth stage and XP",
      "equipped cosmetics and Style Luck",
      "adventure requirements and unlocks",
      "live seasonal/event bonuses",
    ],
    diminishing: {
      perRepeat: ADVENTURE_DIMINISH_PER_REPEAT,
      floor: ADVENTURE_DIMINISH_FLOOR,
      dailyCap: ADVENTURE_LOCATION_DAILY_CAP,
      note: "Same-location repeats in a UTC day lose yield, then the location hard-caps to stop inflation.",
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

/**
 * Items: gathered resources, crafted tools, potions, tonics and lineage
 * relics. Creatures find the resources while they forage (the idle half);
 * the player turns them into things at the workshop (the hands-on half). This catalog is code, not ruleset: it is NOT frozen onto
 * a world, so existing worlds pick it up without a ruleset migration.
 *
 * Ownership is off-chain (host inventory) except relics (LPAR unique NFTs) and
 * the three reward consumables, which may also exist as LPIT multi-token
 * balances. The kernel only ever sees the *effect* of an item, through the
 * GATHER_RESOURCE and USE_ITEM influences.
 */

export const ItemCategory = {
  RESOURCE: "RESOURCE",
  TOOL: "TOOL",
  CONSUMABLE: "CONSUMABLE",
  /** Tonics: a small, lasting change to one creature. */
  ENHANCEMENT: "ENHANCEMENT",
  RELIC: "RELIC",
} as const;
export type ItemCategory = (typeof ItemCategory)[keyof typeof ItemCategory];

export const ItemSlug = {
  CLOVER: "resource.clover",
  GLOWMOSS: "resource.glowmoss",
  CRYSTAL_SHARD: "resource.crystal-shard",
  MOONPETAL: "resource.moonpetal",
  THORNBERRY: "resource.thornberry",
  AMBER_RESIN: "resource.amber-resin",
  SEED_BUNDLE: "tool.seed-bundle",
  SALT_LICK: "tool.salt-lick",
  /** Existing LPIT reward ids 1..3 (apps/sim-host/src/boing/taxonomy.ts). */
  POTION_VITALITY: "potion.vitality",
  POTION_CALM: "potion.calm",
  RATIONS: "item.rations",
  POTION_MENDING: "potion.mending",
  HEARTY_STEW: "item.hearty-stew",
  DREAM_DRAUGHT: "potion.dream-draught",
  TONIC_SWIFT: "tonic.swift",
  TONIC_MIGHT: "tonic.might",
  TONIC_INSIGHT: "tonic.insight",
  RELIC_KEEPSAKE: "relic.keepsake",
  RELIC_FIRST_CHILD: "relic.first-child",
  RELIC_REMEMBRANCE: "relic.remembrance",
} as const;
export type ItemSlug = (typeof ItemSlug)[keyof typeof ItemSlug];

/** Needs (and health) an item can ease on one creature, 0..1000 scale. */
export type CreatureRelief = {
  hunger?: number;
  thirst?: number;
  fatigue?: number;
  discomfort?: number;
  unsafety?: number;
  loneliness?: number;
  health?: number;
};

/** Genes a tonic can raise. */
export type TonicGene = "strength" | "speed" | "intelligence";

/** What USE_ITEM does in the kernel. */
export type ItemEffect =
  | { kind: "FOOD"; amount: number; days: number }
  | { kind: "DANGER"; amount: number; days: number }
  | { kind: "COMFORT"; amount: number; days: number }
  | { kind: "FAVOR"; amount: number }
  /** Given to one creature: eases its needs at once. */
  | { kind: "RELIEF"; relief: CreatureRelief }
  /** Given to one creature: raises a gene for good (its young inherit it). */
  | { kind: "GENE"; gene: TonicGene; amount: number };

/**
 * A tonic never lifts a gene past this (natural genes run to 1000), so the
 * very best creatures are still bred, not brewed.
 */
export const TONIC_GENE_CEILING = 900;

export type ItemDef = {
  slug: ItemSlug;
  displayName: string;
  category: ItemCategory;
  /** Inventory spoils this many days after it was gained; null never spoils. */
  spoilDays: number | null;
  /** null: not usable (raw resources are only crafted). */
  effect: ItemEffect | null;
  /** Target the effect needs. */
  target: "TERRITORY" | "LINEAGE" | "CREATURE" | null;
  /** Host cooldown between uses of this item per account (relics), in days. */
  useCooldownDays: number | null;
  description: string;
};

export const ITEM_CATALOG: readonly ItemDef[] = [
  {
    slug: ItemSlug.CLOVER,
    displayName: "Clover",
    category: ItemCategory.RESOURCE,
    spoilDays: 5,
    effect: null,
    target: null,
    useCooldownDays: null,
    description: "Sweet clover gathered in the Meadow.",
  },
  {
    slug: ItemSlug.GLOWMOSS,
    displayName: "Glowmoss",
    category: ItemCategory.RESOURCE,
    spoilDays: 5,
    effect: null,
    target: null,
    useCooldownDays: null,
    description: "Faintly shining moss from the Glowfen.",
  },
  {
    slug: ItemSlug.CRYSTAL_SHARD,
    displayName: "Crystal shard",
    category: ItemCategory.RESOURCE,
    spoilDays: 7,
    effect: null,
    target: null,
    useCooldownDays: null,
    description: "Salty crystal chipped from the Ridge and High Crags.",
  },
  {
    slug: ItemSlug.MOONPETAL,
    displayName: "Moonpetal",
    category: ItemCategory.RESOURCE,
    spoilDays: 3,
    effect: null,
    target: null,
    useCooldownDays: null,
    description: "A pale petal that only opens in the Moonlit Glade.",
  },
  {
    slug: ItemSlug.THORNBERRY,
    displayName: "Thornberry",
    category: ItemCategory.RESOURCE,
    spoilDays: 4,
    effect: null,
    target: null,
    useCooldownDays: null,
    description: "Tart berries from deep in the Thicket.",
  },
  {
    slug: ItemSlug.AMBER_RESIN,
    displayName: "Amber resin",
    category: ItemCategory.RESOURCE,
    spoilDays: 7,
    effect: null,
    target: null,
    useCooldownDays: null,
    description: "Slow golden resin from the oldest trees of the Elder Grove.",
  },
  {
    slug: ItemSlug.SEED_BUNDLE,
    displayName: "Seed bundle",
    category: ItemCategory.TOOL,
    spoilDays: 7,
    effect: { kind: "FOOD", amount: 100, days: 7 },
    target: "TERRITORY",
    useCooldownDays: null,
    description: "Scatter in a territory: food +100 for 7 days.",
  },
  {
    slug: ItemSlug.SALT_LICK,
    displayName: "Salt lick",
    category: ItemCategory.TOOL,
    spoilDays: 7,
    effect: { kind: "COMFORT", amount: 2, days: 3 },
    target: "TERRITORY",
    useCooldownDays: null,
    description:
      "Place in a territory: thirst and discomfort build slower for 3 days.",
  },
  {
    slug: ItemSlug.RATIONS,
    displayName: "Rations Pack",
    category: ItemCategory.CONSUMABLE,
    spoilDays: null,
    effect: { kind: "FOOD", amount: 75, days: 3 },
    target: "TERRITORY",
    useCooldownDays: null,
    description: "A small Enrich: food +75 in a territory for 3 days.",
  },
  {
    slug: ItemSlug.POTION_CALM,
    displayName: "Calm Potion",
    category: ItemCategory.CONSUMABLE,
    spoilDays: null,
    effect: { kind: "DANGER", amount: -50, days: 3 },
    target: "TERRITORY",
    useCooldownDays: null,
    description: "A small Calm: danger -50 in a territory for 3 days.",
  },
  {
    slug: ItemSlug.POTION_VITALITY,
    displayName: "Vitality Potion",
    category: ItemCategory.CONSUMABLE,
    spoilDays: null,
    effect: { kind: "FAVOR", amount: 50 },
    target: "LINEAGE",
    useCooldownDays: null,
    description: "A small Favor: lineage favor +50.",
  },
  {
    slug: ItemSlug.POTION_MENDING,
    displayName: "Mending Potion",
    category: ItemCategory.CONSUMABLE,
    spoilDays: 10,
    effect: { kind: "RELIEF", relief: { health: 300, discomfort: 150 } },
    target: "CREATURE",
    useCooldownDays: null,
    description: "Give to a creature: health +300 and it rests easier.",
  },
  {
    slug: ItemSlug.HEARTY_STEW,
    displayName: "Hearty Stew",
    category: ItemCategory.CONSUMABLE,
    spoilDays: 4,
    effect: { kind: "RELIEF", relief: { hunger: 500, thirst: 250 } },
    target: "CREATURE",
    useCooldownDays: null,
    description: "Give to a creature: a full meal and a drink.",
  },
  {
    slug: ItemSlug.DREAM_DRAUGHT,
    displayName: "Dream Draught",
    category: ItemCategory.CONSUMABLE,
    spoilDays: 10,
    effect: {
      kind: "RELIEF",
      relief: { fatigue: 500, unsafety: 250, loneliness: 250 },
    },
    target: "CREATURE",
    useCooldownDays: null,
    description: "Give to a creature: it feels rested, safe and less alone.",
  },
  {
    slug: ItemSlug.TONIC_SWIFT,
    displayName: "Swiftness Tonic",
    category: ItemCategory.ENHANCEMENT,
    spoilDays: null,
    effect: { kind: "GENE", gene: "speed", amount: 20 },
    target: "CREATURE",
    useCooldownDays: null,
    description:
      "Give to a creature: speed +20 for good (up to 900). Its young inherit it.",
  },
  {
    slug: ItemSlug.TONIC_MIGHT,
    displayName: "Might Tonic",
    category: ItemCategory.ENHANCEMENT,
    spoilDays: null,
    effect: { kind: "GENE", gene: "strength", amount: 20 },
    target: "CREATURE",
    useCooldownDays: null,
    description:
      "Give to a creature: strength +20 for good (up to 900). Its young inherit it.",
  },
  {
    slug: ItemSlug.TONIC_INSIGHT,
    displayName: "Insight Tonic",
    category: ItemCategory.ENHANCEMENT,
    spoilDays: null,
    effect: { kind: "GENE", gene: "intelligence", amount: 20 },
    target: "CREATURE",
    useCooldownDays: null,
    description:
      "Give to a creature: intelligence +20 for good (up to 900). Its young inherit it.",
  },
  {
    slug: ItemSlug.RELIC_KEEPSAKE,
    displayName: "Lineage Keepsake",
    category: ItemCategory.RELIC,
    spoilDays: null,
    effect: { kind: "FAVOR", amount: 25 },
    target: "LINEAGE",
    useCooldownDays: 7,
    description:
      "Given to whoever first named a lineage. Honor it for +25 favor once a week.",
  },
  {
    slug: ItemSlug.RELIC_FIRST_CHILD,
    displayName: "First Child relic",
    category: ItemCategory.RELIC,
    spoilDays: null,
    effect: { kind: "FAVOR", amount: 25 },
    target: "LINEAGE",
    useCooldownDays: 7,
    description:
      "Marks a lineage's first birth. Honor it for +25 favor once a week.",
  },
  {
    slug: ItemSlug.RELIC_REMEMBRANCE,
    displayName: "Remembrance relic",
    category: ItemCategory.RELIC,
    spoilDays: null,
    effect: { kind: "FAVOR", amount: 25 },
    target: "LINEAGE",
    useCooldownDays: 7,
    description:
      "Marks a lineage's first loss. Honor it for +25 favor once a week.",
  },
];

const BY_SLUG = new Map<string, ItemDef>(
  ITEM_CATALOG.map((def) => [def.slug, def]),
);

export function itemDef(slug: string): ItemDef | undefined {
  return BY_SLUG.get(slug);
}

export function isItemSlug(slug: string): slug is ItemSlug {
  return BY_SLUG.has(slug);
}

/** LPIT kinds that have a still at `/media/items/<stem>.webp`. Relics do not. */
const LPIT_ITEM_IMAGE_SLUGS: ReadonlySet<string> = new Set([
  ItemSlug.CLOVER,
  ItemSlug.GLOWMOSS,
  ItemSlug.CRYSTAL_SHARD,
  ItemSlug.MOONPETAL,
  ItemSlug.SEED_BUNDLE,
  ItemSlug.SALT_LICK,
  ItemSlug.RATIONS,
  ItemSlug.POTION_CALM,
  ItemSlug.POTION_VITALITY,
  ItemSlug.THORNBERRY,
  ItemSlug.AMBER_RESIN,
  ItemSlug.POTION_MENDING,
  ItemSlug.HEARTY_STEW,
  ItemSlug.DREAM_DRAUGHT,
  ItemSlug.TONIC_SWIFT,
  ItemSlug.TONIC_MIGHT,
  ItemSlug.TONIC_INSIGHT,
]);

/** File stem for an item slug (`potion.vitality` → `potion-vitality`). */
export function itemImageStem(slug: string): string {
  return slug.replaceAll(".", "-");
}

/** Marketplace still for an LPIT item, or null when we have no art (relics). */
export function itemImageSrc(slug: string | null | undefined): string | null {
  if (slug == null || !LPIT_ITEM_IMAGE_SLUGS.has(slug)) return null;
  return `/media/items/${itemImageStem(slug)}.webp`;
}

/** Species portrait path, or null when the slug is missing. */
export function speciesImageSrc(
  slug: string | null | undefined,
): string | null {
  if (slug == null || slug === "") return null;
  return `/media/species/${slug}.webp`;
}

/** Best still for a catalog row: item art, then the species portrait. */
export function marketImageSrc(input: {
  itemSlug?: string | null;
  speciesSlug?: string | null;
}): string | null {
  return itemImageSrc(input.itemSlug) ?? speciesImageSrc(input.speciesSlug);
}

/** Where each resource grows. Every listed territory has its own stock. */
export const GATHER_SOURCES: readonly {
  resource: ItemSlug;
  territorySlugs: readonly string[];
}[] = [
  { resource: ItemSlug.CLOVER, territorySlugs: ["meadow"] },
  { resource: ItemSlug.GLOWMOSS, territorySlugs: ["fen"] },
  { resource: ItemSlug.CRYSTAL_SHARD, territorySlugs: ["ridge", "crags"] },
  { resource: ItemSlug.MOONPETAL, territorySlugs: ["glade"] },
  { resource: ItemSlug.THORNBERRY, territorySlugs: ["thicket"] },
  { resource: ItemSlug.AMBER_RESIN, territorySlugs: ["grove"] },
];

export function resourceForTerritory(territorySlug: string): ItemSlug | null {
  for (const source of GATHER_SOURCES) {
    if (source.territorySlugs.includes(territorySlug)) return source.resource;
  }
  return null;
}

/**
 * Gathering balance. A gather takes 1..maxYield units, never more than the
 * territory's free stock. Each unit draws `foodPerUnit` from the territory's
 * effective food (the same pool creatures forage from) until it regrows
 * `regrowDays` later. With stockCap 12 a territory loses at most 120 food.
 */
export const GATHER_RULES = {
  stockCap: 12,
  minYield: 1,
  maxYield: 3,
  foodPerUnit: 10,
  regrowDays: 2,
} as const;

/** Per-tick thirst and discomfort relief from salt licks never exceeds this. */
export const COMFORT_MAX_PER_TICK = 3;

export type Recipe = {
  output: ItemSlug;
  inputs: readonly { slug: ItemSlug; count: number }[];
};

/**
 * The recipe book. Every territory's resource is needed somewhere, so a
 * player has a reason to care about creatures all over the map. Tools and
 * food are cheap; potions need two regions; tonics need crystal from the
 * high country plus a pair of something else.
 */
export const RECIPES: readonly Recipe[] = [
  {
    output: ItemSlug.SEED_BUNDLE,
    inputs: [
      { slug: ItemSlug.CLOVER, count: 3 },
      { slug: ItemSlug.MOONPETAL, count: 1 },
    ],
  },
  {
    output: ItemSlug.SALT_LICK,
    inputs: [
      { slug: ItemSlug.CRYSTAL_SHARD, count: 2 },
      { slug: ItemSlug.GLOWMOSS, count: 1 },
    ],
  },
  {
    output: ItemSlug.RATIONS,
    inputs: [
      { slug: ItemSlug.CLOVER, count: 2 },
      { slug: ItemSlug.THORNBERRY, count: 2 },
    ],
  },
  {
    output: ItemSlug.HEARTY_STEW,
    inputs: [
      { slug: ItemSlug.CLOVER, count: 2 },
      { slug: ItemSlug.AMBER_RESIN, count: 1 },
    ],
  },
  {
    output: ItemSlug.POTION_CALM,
    inputs: [
      { slug: ItemSlug.GLOWMOSS, count: 2 },
      { slug: ItemSlug.MOONPETAL, count: 1 },
    ],
  },
  {
    output: ItemSlug.POTION_MENDING,
    inputs: [
      { slug: ItemSlug.THORNBERRY, count: 2 },
      { slug: ItemSlug.GLOWMOSS, count: 1 },
    ],
  },
  {
    output: ItemSlug.DREAM_DRAUGHT,
    inputs: [
      { slug: ItemSlug.MOONPETAL, count: 2 },
      { slug: ItemSlug.AMBER_RESIN, count: 1 },
    ],
  },
  {
    output: ItemSlug.POTION_VITALITY,
    inputs: [
      { slug: ItemSlug.AMBER_RESIN, count: 2 },
      { slug: ItemSlug.MOONPETAL, count: 1 },
      { slug: ItemSlug.THORNBERRY, count: 1 },
    ],
  },
  {
    output: ItemSlug.TONIC_SWIFT,
    inputs: [
      { slug: ItemSlug.CRYSTAL_SHARD, count: 2 },
      { slug: ItemSlug.MOONPETAL, count: 2 },
    ],
  },
  {
    output: ItemSlug.TONIC_MIGHT,
    inputs: [
      { slug: ItemSlug.CRYSTAL_SHARD, count: 2 },
      { slug: ItemSlug.AMBER_RESIN, count: 2 },
    ],
  },
  {
    output: ItemSlug.TONIC_INSIGHT,
    inputs: [
      { slug: ItemSlug.CRYSTAL_SHARD, count: 2 },
      { slug: ItemSlug.GLOWMOSS, count: 2 },
    ],
  },
];

/**
 * Recipes a creature may craft on its own (when its keeper allows it): only
 * things creatures can use themselves. Potions for another creature and
 * tonics are the player's craft.
 */
export function creatureCraftable(output: string): boolean {
  return CREATURE_USE_RULES.some((rule) => rule.item === output);
}

export function recipeFor(output: string): Recipe | undefined {
  return RECIPES.find((recipe) => recipe.output === output);
}

export type GatherResourcePayload = {
  territoryId: number;
  resource: ItemSlug;
  /** Units the host granted at acceptance (see sim `gatherYield`). */
  units: number;
};

export type UseItemPayload = {
  item: ItemSlug;
  territoryId?: number;
  lineageId?: number;
  /** For items given to one creature (potions, tonics). */
  creatureId?: number;
};

/** One stack of an off-chain item in a player's inventory. */
export type InventoryEntry = {
  slug: ItemSlug;
  count: number;
  /**
   * Units of `count` already minted to LPIT (on chain). Creatures never use
   * minted units; they are kept for the market.
   */
  minted: number;
  /** Earliest tick at which part of this stack spoils; null never spoils. */
  nextSpoilTick: number | null;
};

/**
 * Creature autonomy (loot, craft, use). Code catalog, not ruleset: live
 * worlds pick it up without a ruleset migration.
 *
 * LOOT happens inside the deterministic kernel: a creature that finishes a
 * successful FORAGE in a territory where a resource grows may pick up one
 * unit. It draws from the same regrowing stock as player gathers (a HARVEST
 * modifier), so creature loot never adds supply beyond `GATHER_RULES`:
 *
 * - `chancePerMille`: roll per successful forage (seeded, replay-safe).
 * - `reserve`: creatures only loot while more than this many units are free,
 *   so players can always gather the last `reserve` units.
 * - `perTerritoryPerDay`: at most this many creature loots per territory in
 *   any rolling sim day (counted from the HARVEST rows themselves).
 *
 * Crafting and using are decided by the pure planner in `@boing-pets/sim`
 * (`planCreatureAutonomy`) from the creature's needs and what it may use;
 * the host turns each decision into a recorded CREATURE_* influence, so
 * replaying the influence log reproduces the world exactly. They never spend
 * the player's 3-per-day influence budget.
 */
export const LOOT_RULES = {
  chancePerMille: 300,
  units: 1,
  reserve: 6,
  perTerritoryPerDay: 3,
} as const;

export const AUTONOMY_RULES = {
  /** The host plans crafts and uses once per this many ticks (1 sim hour). */
  everyTicks: 6,
  /** A creature uses at most one item per this many ticks (6 sim hours). */
  useCooldownTicks: 36,
  /** At most this many uses per keeper's bag per sim day (pouches: no cap). */
  maxUsesPerBagPerDay: 6,
  /** At most one craft per bag per planning pass. */
  maxCraftsPerBagPerPass: 1,
} as const;

/** What a creature does with an item it uses on itself (or its territory). */
export type CreatureUseRule = {
  item: ItemSlug;
  /** Past-tense verb for the activity line ("Meadow ate a Rations Pack."). */
  verb: string;
  /**
   * Direct relief on the creature's needs and health. Null means the item's
   * catalog territory effect is applied to the creature's current territory.
   */
  relief: {
    hunger?: number;
    thirst?: number;
    discomfort?: number;
    unsafety?: number;
    health?: number;
  } | null;
};

/**
 * Items a creature may use on its own, in priority order. Raw resources are
 * never eaten: they are only crafted. Thresholds live in the planner.
 */
export const CREATURE_USE_RULES: readonly CreatureUseRule[] = [
  { item: ItemSlug.POTION_VITALITY, verb: "drank", relief: { health: 250 } },
  { item: ItemSlug.RATIONS, verb: "ate", relief: { hunger: 350 } },
  {
    item: ItemSlug.POTION_CALM,
    verb: "drank",
    relief: { unsafety: 400, discomfort: 100 },
  },
  { item: ItemSlug.SEED_BUNDLE, verb: "planted", relief: null },
  { item: ItemSlug.SALT_LICK, verb: "set out", relief: null },
];

export function creatureUseRule(slug: string): CreatureUseRule | undefined {
  return CREATURE_USE_RULES.find((rule) => rule.item === slug);
}

/** When the planner reaches for each item (0..1000 need scale). */
export const CREATURE_USE_THRESHOLDS = {
  vitalityHealthAtMost: 450,
  rationsHungerAtLeast: 650,
  calmUnsafetyAtLeast: 650,
  seedHungerAtLeast: 550,
  seedTerritoryFoodBelow: 300,
  saltThirstOrDiscomfortAtLeast: 650,
} as const;

/** Host-issued payloads (never accepted from a client). */
export type CreatureUseItemPayload = {
  creatureId: number;
  item: ItemSlug;
  /** Territory for SEED_BUNDLE / SALT_LICK (the creature's own). */
  territoryId?: number;
};

export type CreatureCraftPayload = {
  creatureId: number;
  output: ItemSlug;
};

/** Per keeper: may their creatures craft from / use their (unminted) bag? */
export type ItemAutonomySettings = {
  autoCraft: boolean;
  autoUse: boolean;
};

/**
 * Crafting is the player's part of the game, so creatures leave the
 * workbench alone unless their keeper turns this on. They still help
 * themselves to food and potions from the bag when they need them.
 */
export const DEFAULT_ITEM_AUTONOMY: ItemAutonomySettings = {
  autoCraft: false,
  autoUse: true,
};

/**
 * Mint on demand: items stay off chain (DB inventory) until their keeper
 * chooses Mint in the marketplace; the operator then mints them as LPIT to
 * the keeper's wallet through the serial nonce queue. The operator pays the
 * gas (about 0.0004 BOING per mint transaction, any quantity), so requests
 * are limited per wallet.
 */
export const MINT_RULES = {
  minQty: 1,
  maxQty: 20,
  /** Mint requests per wallet per rolling 24 hours. */
  maxRequestsPerDay: 3,
  /**
   * Default player fee per mint request, in base units: 0.0005 BOING. One
   * LPIT mint costs the operator ~42.8k gas (~0.00043 BOING); the rest is
   * margin. Hosts override it with LIVING_PETS_ITEM_MINT_FEE (in BOING).
   */
  defaultFeeWei: "500000000000000",
  /** A fee transfer older than this cannot pay for a mint. */
  paymentMaxAgeMs: 24 * 60 * 60 * 1000,
} as const;

/** A lineage relic (LPAR unique NFT) this account holds. */
export type RelicHolding = {
  slug: ItemSlug;
  lineageId: number;
  tokenSerial: number;
  /** Mint status of the on-chain token (PENDING, MINTED, FAILED, ...). */
  mintStatus: string;
  /** Wall ms when it can be honored again; null means now. */
  usableAtMs: number | null;
};

export type InventoryView = {
  accountId: string;
  tick: number;
  /** True for wallet and local accounts; guests cannot hold items. */
  canHoldItems: boolean;
  items: InventoryEntry[];
  relics: RelicHolding[];
  /** Recipes whose inputs are all on hand. */
  craftable: ItemSlug[];
  /** May this keeper's creatures craft from / use their bag on their own? */
  autonomy: ItemAutonomySettings;
  /** Free gather stock per resource territory. */
  stocks: {
    territoryId: number;
    resource: ItemSlug;
    free: number;
    cap: number;
  }[];
};

export type ItemCraft = { output: ItemSlug };
export type ItemAutonomyCommand = Partial<ItemAutonomySettings>;

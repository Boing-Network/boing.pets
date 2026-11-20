/**
 * Item slice 1 (M22): gathered resources, crafted tools, consumable rewards
 * and lineage relics. This catalog is code, not ruleset: it is NOT frozen onto
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
  RELIC: "RELIC",
} as const;
export type ItemCategory = (typeof ItemCategory)[keyof typeof ItemCategory];

export const ItemSlug = {
  CLOVER: "resource.clover",
  GLOWMOSS: "resource.glowmoss",
  CRYSTAL_SHARD: "resource.crystal-shard",
  MOONPETAL: "resource.moonpetal",
  SEED_BUNDLE: "tool.seed-bundle",
  SALT_LICK: "tool.salt-lick",
  /** Existing LPIT reward ids 1..3 (apps/sim-host/src/boing/taxonomy.ts). */
  POTION_VITALITY: "potion.vitality",
  POTION_CALM: "potion.calm",
  RATIONS: "item.rations",
  RELIC_KEEPSAKE: "relic.keepsake",
  RELIC_FIRST_CHILD: "relic.first-child",
  RELIC_REMEMBRANCE: "relic.remembrance",
} as const;
export type ItemSlug = (typeof ItemSlug)[keyof typeof ItemSlug];

/** What USE_ITEM does in the kernel. */
export type ItemEffect =
  | { kind: "FOOD"; amount: number; days: number }
  | { kind: "DANGER"; amount: number; days: number }
  | { kind: "COMFORT"; amount: number; days: number }
  | { kind: "FAVOR"; amount: number };

export type ItemDef = {
  slug: ItemSlug;
  displayName: string;
  category: ItemCategory;
  /** Inventory spoils this many days after it was gained; null never spoils. */
  spoilDays: number | null;
  /** null: not usable (raw resources are only crafted). */
  effect: ItemEffect | null;
  /** Target the effect needs. */
  target: "TERRITORY" | "LINEAGE" | null;
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

/** Where each resource grows. Every listed territory has its own stock. */
export const GATHER_SOURCES: readonly {
  resource: ItemSlug;
  territorySlugs: readonly string[];
}[] = [
  { resource: ItemSlug.CLOVER, territorySlugs: ["meadow"] },
  { resource: ItemSlug.GLOWMOSS, territorySlugs: ["fen"] },
  { resource: ItemSlug.CRYSTAL_SHARD, territorySlugs: ["ridge", "crags"] },
  { resource: ItemSlug.MOONPETAL, territorySlugs: ["glade"] },
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
];

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
};

/** One stack of an off-chain item in a player's inventory. */
export type InventoryEntry = {
  slug: ItemSlug;
  count: number;
  /** Earliest tick at which part of this stack spoils; null never spoils. */
  nextSpoilTick: number | null;
};

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
  /** Free gather stock per resource territory. */
  stocks: {
    territoryId: number;
    resource: ItemSlug;
    free: number;
    cap: number;
  }[];
};

export type ItemCraft = { output: ItemSlug };

/**
 * Quarry gathering rules. The Worker is the clock: callers pass a tick count
 * the server already derived from wall time. There is no client tick argument.
 */

import { ORES, PICKAXES, type OreDef } from "./mining";
import { mulberry32, seedFromParts, type Rng } from "./adventures";

export const GATHER_SKILL_QUARRY = "quarry" as const;
export const GATHER_SKILL_IDS = ["quarry", "line", "plot", "sweep"] as const;
export type GatherSkillId = (typeof GATHER_SKILL_IDS)[number];
export const GATHER_PACK_UNITS = 28;
export const GATHER_LEVEL_CAP = 50;
export const GATHER_VIRTUAL_LEVEL_CAP = 120;
export const GATHER_CRED_UNITS_PER_DAY = 80;
export const GATHER_NODE_MIN_MS = 120_000;
export const GATHER_NODE_MAX_MS = 300_000;
export const GATHER_TICK_MS_L1 = 4_000;
export const GATHER_TICK_MS_CAP = 2_400;
export const GATHER_RESTART_GAP_MS = 1_500;
export const GATHER_FACE_ID = "quarry-face";

export const GATHER_SKILL_META: Record<
  GatherSkillId,
  { name: string; stationId: string; faceId: string; usesPick: boolean }
> = {
  quarry: {
    name: "Quarry",
    stationId: "pasture-mine",
    faceId: GATHER_FACE_ID,
    usesPick: true,
  },
  line: {
    name: "Line",
    stationId: "pasture-fish",
    faceId: "line-spot",
    usesPick: false,
  },
  plot: {
    name: "Plot",
    stationId: "pasture-garden",
    faceId: "plot-bed",
    usesPick: false,
  },
  sweep: {
    name: "Sweep",
    stationId: "pasture-treasure",
    faceId: "sweep-patch",
    usesPick: false,
  },
};

export const GATHER_SKILL_PROMPT: Record<
  GatherSkillId,
  {
    working: string;
    depleted: string;
    act: string;
    again: string;
    idle: string;
  }
> = {
  quarry: {
    working: "On the face.",
    depleted: "Face is dead. Hit it again.",
    act: "Work the face",
    again: "Hit it again",
    idle: "Hit the face. It dies on its own.",
  },
  line: {
    working: "On the line.",
    depleted: "The spot went quiet. Cast again.",
    act: "Cast",
    again: "Cast again",
    idle: "Cast into the canal. The spot dies on its own.",
  },
  plot: {
    working: "On the bed.",
    depleted: "The bed is spent. Tend it again.",
    act: "Tend",
    again: "Tend again",
    idle: "Tend the bed. It dies on its own.",
  },
  sweep: {
    working: "Sweeping.",
    depleted: "The patch is clean. Sweep again.",
    act: "Sweep",
    again: "Sweep again",
    idle: "Sweep the patch. It dies on its own.",
  },
};

export function isGatherSkill(value: unknown): value is GatherSkillId {
  return (
    typeof value === "string" &&
    (GATHER_SKILL_IDS as readonly string[]).includes(value)
  );
}
export const MINT_BATCH_PRESETS = [10, 100, 1_000, 10_000] as const;
export const MINT_BATCH_MAX = 10_000;

export const GATHER_COPY = {
  working: "On the face.",
  depleted: "Face is dead. Hit it again.",
  packed: "Pack's full. Bank it at the Block Vault.",
  mintClosed: "Mint is closed.",
  retired: "Work the face at the quarry.",
} as const;

export type QuarryNode = {
  id: string;
  name: string;
  rarity: OreDef["rarity"];
  minLevel: number;
  minTier: number;
  weight: number;
  rewardBoinglets: number;
  xp: number;
};

const XP_BY_RARITY: Record<OreDef["rarity"], number> = {
  common: 8,
  uncommon: 16,
  rare: 28,
  epic: 48,
  legendary: 48,
  mythic: 48,
  iconic: 48,
};

const NODE_GATES: Record<string, { minLevel: number; minTier: number }> = {
  "ore-pebble": { minLevel: 1, minTier: 1 },
  "ore-spark": { minLevel: 1, minTier: 1 },
  "ore-emberite": { minLevel: 15, minTier: 2 },
  "ore-crystal": { minLevel: 20, minTier: 2 },
  "ore-aetherite": { minLevel: 35, minTier: 3 },
};

export const QUARRY_NODES: readonly QuarryNode[] = ORES.map((ore) => {
  const gate = NODE_GATES[ore.id];
  if (!gate) throw new Error(`Quarry is missing a gate for ${ore.id}`);
  return {
    id: ore.id,
    name: ore.name,
    rarity: ore.rarity,
    minLevel: gate.minLevel,
    minTier: gate.minTier,
    weight: ore.weight,
    rewardBoinglets: ore.rewardBoinglets,
    xp: XP_BY_RARITY[ore.rarity],
  };
});

const PICK_SUCCESS: Record<number, number> = {
  1: 1,
  2: 1.08,
  3: 1.15,
  4: 1.22,
};

/** XP required to reach `level` on the OSRS curve. Level 1 is 0. */
export function xpToReach(level: number): number {
  const target = Math.max(1, Math.floor(level));
  let points = 0;
  for (let n = 1; n < target; n++) {
    points += Math.floor(n + 300 * 2 ** (n / 7));
  }
  return Math.floor(points / 4);
}

export function virtualLevel(xp: number): number {
  const safe = Number.isFinite(xp) && xp > 0 ? Math.floor(xp) : 0;
  let level = 1;
  for (let n = 2; n <= GATHER_VIRTUAL_LEVEL_CAP; n++) {
    if (xpToReach(n) > safe) break;
    level = n;
  }
  return level;
}

export type SkillProgress = {
  xp: number;
  /** Unlock level. Never above 50. */
  level: number;
  /** Cosmetic count past 50. Opens nothing. */
  prestige: number;
  virtual: number;
  xpAtLevel: number;
  xpAtNext: number;
};

export function skillProgress(xp: number): SkillProgress {
  const safe = Number.isFinite(xp) && xp > 0 ? Math.floor(xp) : 0;
  const virtual = virtualLevel(safe);
  const level = Math.min(GATHER_LEVEL_CAP, virtual);
  const prestige = Math.max(0, virtual - GATHER_LEVEL_CAP);
  const nextVirtual = Math.min(GATHER_VIRTUAL_LEVEL_CAP, virtual + 1);
  return {
    xp: safe,
    level,
    prestige,
    virtual,
    xpAtLevel: xpToReach(virtual),
    xpAtNext: xpToReach(nextVirtual),
  };
}

export function levelUpLabel(
  level: number,
  prestige: number,
  skill: GatherSkillId = GATHER_SKILL_QUARRY,
): string {
  const name = GATHER_SKILL_META[skill].name.toUpperCase();
  if (prestige > 0) return `${name} P${prestige}`;
  return `${name} ${level}`;
}

export function levelsCrossed(
  beforeXp: number,
  afterXp: number,
  skill: GatherSkillId = GATHER_SKILL_QUARRY,
): Array<{ level: number; prestige: number; label: string }> {
  const from = virtualLevel(beforeXp);
  const to = virtualLevel(afterXp);
  const crossed: Array<{ level: number; prestige: number; label: string }> = [];
  for (let virtual = from + 1; virtual <= to; virtual++) {
    const level = Math.min(GATHER_LEVEL_CAP, virtual);
    const prestige = Math.max(0, virtual - GATHER_LEVEL_CAP);
    crossed.push({
      level,
      prestige,
      label: levelUpLabel(level, prestige, skill),
    });
  }
  return crossed;
}

/** Functional level only. Prestige does not shorten ticks. */
export function tickMs(level: number): number {
  const lv = Math.min(GATHER_LEVEL_CAP, Math.max(1, Math.floor(level)));
  return Math.max(
    GATHER_TICK_MS_CAP,
    GATHER_TICK_MS_L1 - Math.floor(((lv - 1) * 1600) / 49),
  );
}

/** Hidden node life. Wall clock stays about 2–5 minutes at every level. */
export function rollDepleteTicks(rng: Rng, tick: number): number {
  const span = GATHER_NODE_MAX_MS - GATHER_NODE_MIN_MS;
  const lifeMs = GATHER_NODE_MIN_MS + Math.floor(rng() * (span + 1));
  const ticks = Math.round(lifeMs / Math.max(1, tick));
  return Math.min(140, Math.max(30, ticks));
}

export function nodeLifeMs(depleteTicks: number, tick: number): number {
  return depleteTicks * tick;
}

const XP_FOR_RARITY = XP_BY_RARITY;

function skillNode(
  id: string,
  name: string,
  rarity: OreDef["rarity"],
  minLevel: number,
  weight: number,
  rewardBoinglets: number,
): QuarryNode {
  return {
    id,
    name,
    rarity,
    minLevel,
    minTier: 1,
    weight,
    rewardBoinglets,
    xp: XP_FOR_RARITY[rarity],
  };
}

export const LINE_NODES: readonly QuarryNode[] = [
  skillNode("fish-ripple", "Curb Minnow", "common", 1, 48, 4),
  skillNode("fish-boingfin", "Alleyfin", "uncommon", 10, 24, 10),
  skillNode("fish-copperfin", "Copperfin", "uncommon", 20, 16, 12),
  skillNode("fish-moonkoi", "Night Koi", "rare", 35, 9, 22),
  skillNode("fish-starfin", "Starfin", "epic", 45, 3, 34),
];

export const PLOT_NODES: readonly QuarryNode[] = [
  skillNode("crop-sprout", "Curb Sprout", "common", 1, 40, 6),
  skillNode("crop-forage", "Lot Greens", "common", 1, 28, 4),
  skillNode("crop-berry", "Lot Berry", "uncommon", 15, 18, 10),
  skillNode("crop-honeyroot", "Honeyroot", "uncommon", 20, 14, 12),
  skillNode("crop-moonbloom", "Nightbloom", "rare", 35, 8, 16),
  skillNode("crop-starglider", "Highrise Bloom", "epic", 45, 3, 24),
];

export const SWEEP_NODES: readonly QuarryNode[] = [
  skillNode("loot-pebble", "Alley Pebble", "common", 1, 46, 5),
  skillNode("loot-map-scrap", "Map Scrap", "uncommon", 10, 24, 12),
  skillNode("loot-wind-bell", "Chain Bell", "uncommon", 20, 16, 14),
  skillNode("loot-sun-shard", "Flare Shard", "rare", 35, 10, 28),
  skillNode("loot-comet-bead", "Signal Bead", "epic", 45, 4, 40),
];

export function nodesForSkill(
  skill: GatherSkillId,
  level: number,
  pickTier = 1,
): QuarryNode[] {
  if (skill === GATHER_SKILL_QUARRY) return quarryNodesFor(level, pickTier);
  const table =
    skill === "line" ? LINE_NODES : skill === "plot" ? PLOT_NODES : SWEEP_NODES;
  const lv = Math.min(GATHER_LEVEL_CAP, Math.max(1, Math.floor(level)));
  return table
    .filter((node) => lv >= node.minLevel)
    .map((node) => ({ ...node }));
}

export function skillForItem(itemId: string): GatherSkillId | null {
  if (QUARRY_NODES.some((node) => node.id === itemId)) return "quarry";
  if (LINE_NODES.some((node) => node.id === itemId)) return "line";
  if (PLOT_NODES.some((node) => node.id === itemId)) return "plot";
  if (SWEEP_NODES.some((node) => node.id === itemId)) return "sweep";
  return null;
}

export function quarryNodesFor(level: number, pickTier: number): QuarryNode[] {
  const lv = Math.min(GATHER_LEVEL_CAP, Math.max(1, Math.floor(level)));
  const tier = Math.max(1, Math.floor(pickTier));
  return QUARRY_NODES.filter(
    (node) => lv >= node.minLevel && tier >= node.minTier,
  );
}

export function pickSuccessMultiplier(pickTier: number): number {
  return PICK_SUCCESS[Math.max(1, Math.min(4, Math.floor(pickTier)))] ?? 1;
}

/** Face success chance. Pickaxe tier is a hard gate on which ores roll, and a rate bonus. */
export function faceSuccessChance(level: number, pickTier: number): number {
  const lv = Math.min(GATHER_LEVEL_CAP, Math.max(1, Math.floor(level)));
  const base = Math.min(0.72, 0.35 + 0.004 * (lv - 1));
  return Math.min(0.72, base * pickSuccessMultiplier(pickTier));
}

function effectiveShares(level: number, nodes: QuarryNode[]): number[] {
  const lv = Math.min(GATHER_LEVEL_CAP, Math.max(1, level));
  const baseTotal = nodes.reduce((sum, node) => sum + node.weight, 0);
  const scaled = nodes.map((node) => {
    const mult = 1 + 0.01 * Math.max(0, lv - node.minLevel);
    return node.weight * mult;
  });
  const scaledTotal = scaled.reduce((sum, weight) => sum + weight, 0) || 1;
  const capped = scaled.map((weight, index) => {
    const baseShare = nodes[index]!.weight / baseTotal;
    const cap = Math.min(0.5, 2 * baseShare);
    return Math.min(weight / scaledTotal, cap);
  });
  const cappedTotal = capped.reduce((sum, share) => sum + share, 0) || 1;
  return capped.map((share) => share / cappedTotal);
}

export function rollQuarryOre(
  rng: Rng,
  level: number,
  nodes: QuarryNode[],
): QuarryNode {
  const shares = effectiveShares(level, nodes);
  let cursor = rng();
  for (let i = 0; i < nodes.length; i++) {
    cursor -= shares[i]!;
    if (cursor <= 0) return nodes[i]!;
  }
  return nodes[0]!;
}

export type TickGrant = {
  itemId: string | null;
  xp: number;
  packed: boolean;
};

/**
 * Apply `tickCount` server ticks. Stops before a success that would exceed
 * the pack, and does not consume that tick (`packed` is true, caller keeps it).
 */
export function applyGatherTicks(input: {
  tickCount: number;
  seed: string;
  ticksAlreadySettled: number;
  packUnits: number;
  level: number;
  pickTier: number;
  nodes?: QuarryNode[];
}): {
  consumed: number;
  packed: boolean;
  items: Record<string, number>;
  xp: number;
  packUnits: number;
} {
  const nodes = input.nodes ?? quarryNodesFor(input.level, input.pickTier);
  const items: Record<string, number> = {};
  let packUnits = input.packUnits;
  let xp = 0;
  let consumed = 0;
  if (!nodes.length || input.tickCount <= 0) {
    return { consumed, packed: false, items, xp, packUnits };
  }
  const chance = faceSuccessChance(input.level, input.pickTier);
  for (let n = 0; n < input.tickCount; n++) {
    const index = input.ticksAlreadySettled + n;
    const rng = mulberry32(seedFromParts(input.seed, index));
    const success = rng() < chance;
    if (!success) {
      consumed += 1;
      continue;
    }
    if (packUnits + 1 > GATHER_PACK_UNITS) {
      return { consumed, packed: true, items, xp, packUnits };
    }
    const ore = rollQuarryOre(rng, input.level, nodes);
    items[ore.id] = (items[ore.id] ?? 0) + 1;
    xp += ore.xp;
    packUnits += 1;
    consumed += 1;
  }
  return { consumed, packed: false, items, xp, packUnits };
}

export function credPerUnit(rewardBoinglets: number): number {
  return Math.max(1, Math.floor(rewardBoinglets / 8));
}

export function credForOre(itemId: string): number {
  const node = [
    ...QUARRY_NODES,
    ...LINE_NODES,
    ...PLOT_NODES,
    ...SWEEP_NODES,
  ].find((row) => row.id === itemId);
  if (!node) return 0;
  return credPerUnit(node.rewardBoinglets);
}

export type BankLine = { itemId: string; qty: number };

/** Cred for a bank, in item-id order, stopping after the daily unit cap. */
export function planBankCred(
  lines: BankLine[],
  credItemsAlready: number,
): { cred: number; paidUnits: number; byItem: Record<string, number> } {
  let remaining = Math.max(0, GATHER_CRED_UNITS_PER_DAY - credItemsAlready);
  let cred = 0;
  let paidUnits = 0;
  const byItem: Record<string, number> = {};
  const ordered = [...lines].sort((a, b) => a.itemId.localeCompare(b.itemId));
  for (const line of ordered) {
    const qty = Math.max(0, Math.floor(line.qty));
    if (qty <= 0 || remaining <= 0) {
      byItem[line.itemId] = 0;
      continue;
    }
    const payable = Math.min(qty, remaining);
    const each = credForOre(line.itemId);
    const lineCred = payable * each;
    byItem[line.itemId] = lineCred;
    cred += lineCred;
    paidUnits += payable;
    remaining -= payable;
  }
  return { cred, paidUnits, byItem };
}

export function quarrySeedXp(input: {
  pickTier: number;
  discoveredIds: readonly string[];
}): number {
  const found = new Set(input.discoveredIds);
  if (found.has("ore-aetherite") || input.pickTier >= 3) return xpToReach(35);
  if (found.has("ore-crystal") || input.pickTier >= 2) return xpToReach(20);
  if (found.has("ore-emberite")) return xpToReach(15);
  return 0;
}

export function pickTierFromIds(itemIds: readonly string[]): number {
  let tier = 1;
  for (const pick of PICKAXES) {
    if (itemIds.includes(pick.id) && pick.tier > tier) tier = pick.tier;
  }
  return tier;
}

export type MintPreset = { qty: number; enabled: boolean };

/** Presets larger than the banked stack are disabled. They are not silently clamped. */
export function mintPresets(banked: number): MintPreset[] {
  const have = Math.max(0, Math.floor(banked));
  return MINT_BATCH_PRESETS.map((qty) => ({ qty, enabled: have >= qty }));
}

export function parseMintQty(qty: unknown, banked: number): number {
  if (typeof qty !== "number" || !Number.isInteger(qty) || qty < 1)
    throw new Error("Mint amount must be a whole number");
  if (qty > MINT_BATCH_MAX) throw new Error("Mint amount is too large");
  if (qty > Math.max(0, Math.floor(banked)))
    throw new Error("Not enough banked");
  return qty;
}

export function parseMintClientKey(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(value))
    throw new Error("Mint request needs a client key");
  return value;
}

export function dueTicks(input: {
  now: number;
  startedAt: number;
  tick: number;
  depleteTicks: number;
  ticksSettled: number;
}): number {
  const elapsed = Math.max(0, input.now - input.startedAt);
  const earned = Math.floor(elapsed / Math.max(1, input.tick));
  const due = Math.min(input.depleteTicks, earned);
  return Math.max(input.ticksSettled, due);
}

export function gatherQuarryEnabled(env: { GATHER_QUARRY?: string }): boolean {
  return gatherSkillEnabled(env, GATHER_SKILL_QUARRY);
}

export function gatherSkillEnabled(
  env: {
    GATHER_QUARRY?: string;
    GATHER_LINE?: string;
    GATHER_PLOT?: string;
    GATHER_SWEEP?: string;
  },
  skill: GatherSkillId,
): boolean {
  const key =
    skill === "line"
      ? "GATHER_LINE"
      : skill === "plot"
        ? "GATHER_PLOT"
        : skill === "sweep"
          ? "GATHER_SWEEP"
          : "GATHER_QUARRY";
  return (
    String(env[key] ?? "off")
      .trim()
      .toLowerCase() === "on"
  );
}

export function gatherSkillFlags(env: {
  GATHER_QUARRY?: string;
  GATHER_LINE?: string;
  GATHER_PLOT?: string;
  GATHER_SWEEP?: string;
}): Record<GatherSkillId, boolean> {
  return {
    quarry: gatherSkillEnabled(env, "quarry"),
    line: gatherSkillEnabled(env, "line"),
    plot: gatherSkillEnabled(env, "plot"),
    sweep: gatherSkillEnabled(env, "sweep"),
  };
}

/** Vault mint submits only when this is on. The default in wrangler is off. */
export function gatherMintEnabled(env: { GATHER_MINT?: string }): boolean {
  return (
    String(env.GATHER_MINT ?? "off")
      .trim()
      .toLowerCase() === "on"
  );
}

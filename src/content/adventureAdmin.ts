/** Pure validation and merge for Idle Adventures admin overrides. */

import {
  ADVENTURE_ICONIC_CEILING_WEIGHT,
  ADVENTURE_MYTHIC_CEILING_WEIGHT,
  ADVENTURE_RARITY_WEIGHTS,
  STYLE_LUCK_MULTIPLIER_CAP,
  STYLE_LUCK_RARITY_POINTS,
  STYLE_SETS,
  type StyleSetId,
} from "./adventures";
import { ITEM_RARITIES, isItemRarity, type ItemRarity } from "./rarities";

export const ADVENTURE_ADMIN_MESSAGE_PREFIX = "Boing Pets adventure admin v1";
export const ADVENTURE_ADMIN_SKEW_MS = 10 * 60_000;
export const OWNER_COUNT_TTL_MS = 15_000;
export const ANALYTICS_CACHE_TTL_MS = 30_000;

export const ADVENTURE_ADMIN_ACTIONS = [
  "state",
  "analytics",
  "popup-create",
  "popup-update",
  "popup-end",
  "override-rarity",
  "override-luck",
] as const;

export type AdventureAdminAction = (typeof ADVENTURE_ADMIN_ACTIONS)[number];

export function isAdventureAdminAction(
  value: string,
): value is AdventureAdminAction {
  return (ADVENTURE_ADMIN_ACTIONS as readonly string[]).includes(value);
}

export type RarityOverridePayload = {
  weights?: Partial<Record<ItemRarity, number>>;
  pityGrants?: ItemRarity;
};

export type StyleLuckOverridePayload = {
  rarityPoints?: Partial<Record<ItemRarity, number>>;
  multiplierCap?: number;
  setBonusPoints?: Partial<Record<StyleSetId, number>>;
};

export type PopupPoolItem = {
  itemId: string;
  rarity: ItemRarity;
  qty?: number;
};

export type PopupEventPayload = {
  id?: string;
  name: string;
  description?: string;
  startsAt: number;
  endsAt: number;
  pool?: PopupPoolItem[];
  status?: "scheduled" | "live" | "ended";
};

export type OverrideKind = "rarity_table" | "style_luck";

export class AdventureAdminValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdventureAdminValidationError";
  }
}

export function buildAdventureAdminMessage(input: {
  origin: string;
  issuedAt: number;
  action: AdventureAdminAction;
}): string {
  return [
    ADVENTURE_ADMIN_MESSAGE_PREFIX,
    `Origin: ${input.origin}`,
    `Issued: ${input.issuedAt}`,
    `Action: ${input.action}`,
  ].join("\n");
}

export function assertAdminMessage(input: {
  message: string;
  origin: string;
  issuedAt: number;
  action: AdventureAdminAction;
  now: number;
}): void {
  if (
    !Number.isFinite(input.issuedAt) ||
    Math.abs(input.now - input.issuedAt) > ADVENTURE_ADMIN_SKEW_MS
  ) {
    throw new AdventureAdminValidationError(
      "Admin authorization is expired or invalid",
    );
  }
  if (
    !input.message.includes(ADVENTURE_ADMIN_MESSAGE_PREFIX) ||
    !input.message.includes(`Issued: ${input.issuedAt}`) ||
    !input.message.includes(`Action: ${input.action}`) ||
    !input.message.includes(`Origin: ${input.origin}`)
  ) {
    throw new AdventureAdminValidationError(
      "Admin authorization is expired or invalid",
    );
  }
}

function asInt(value: unknown, label: string): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    throw new AdventureAdminValidationError(
      `${label} must be a non-negative integer`,
    );
  }
  return n;
}

const PITY_ALLOWED: ItemRarity[] = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
];

export function validatePityGrants(value: unknown): ItemRarity {
  if (typeof value !== "string" || !isItemRarity(value)) {
    throw new AdventureAdminValidationError("pityGrants must be a rarity");
  }
  if (value === "mythic" || value === "iconic") {
    throw new AdventureAdminValidationError(
      "Pity can never include Mythic or Iconic (Grail or Vaulted)",
    );
  }
  if (!PITY_ALLOWED.includes(value)) {
    throw new AdventureAdminValidationError(
      "Pity can never include Mythic or Iconic (Grail or Vaulted)",
    );
  }
  return value;
}

export function clampIconicWeight(weight: number): number {
  return Math.min(Math.max(0, weight), ADVENTURE_ICONIC_CEILING_WEIGHT);
}

export function validateRarityOverride(input: unknown): RarityOverridePayload {
  if (!input || typeof input !== "object") {
    throw new AdventureAdminValidationError("Rarity override is required");
  }
  const raw = input as RarityOverridePayload;
  const weights: Partial<Record<ItemRarity, number>> = {};
  if (raw.weights != null) {
    if (typeof raw.weights !== "object") {
      throw new AdventureAdminValidationError("weights must be an object");
    }
    for (const [key, value] of Object.entries(raw.weights)) {
      if (!isItemRarity(key)) {
        throw new AdventureAdminValidationError(`Unknown rarity ${key}`);
      }
      const weight = asInt(value, key);
      if (key === "iconic" && weight > ADVENTURE_ICONIC_CEILING_WEIGHT) {
        throw new AdventureAdminValidationError(
          `Iconic cannot be set above the hard ceiling of ${ADVENTURE_ICONIC_CEILING_WEIGHT}`,
        );
      }
      if (key === "mythic" && weight > ADVENTURE_MYTHIC_CEILING_WEIGHT) {
        throw new AdventureAdminValidationError(
          `Mythic cannot be set above the hard ceiling of ${ADVENTURE_MYTHIC_CEILING_WEIGHT}`,
        );
      }
      weights[key] = weight;
    }
  }
  const pityGrants =
    raw.pityGrants != null ? validatePityGrants(raw.pityGrants) : undefined;
  if (!Object.keys(weights).length && !pityGrants) {
    throw new AdventureAdminValidationError(
      "Rarity override needs weights or pityGrants",
    );
  }
  return {
    weights: Object.keys(weights).length ? weights : undefined,
    pityGrants,
  };
}

export function mergeRarityWeights(
  override?: RarityOverridePayload | null,
  base: Record<ItemRarity, number> = ADVENTURE_RARITY_WEIGHTS,
): Record<ItemRarity, number> {
  const out = { ...base };
  if (override?.weights) {
    for (const rarity of ITEM_RARITIES) {
      const next = override.weights[rarity];
      if (typeof next === "number") out[rarity] = next;
    }
  }
  out.mythic = Math.min(out.mythic, ADVENTURE_MYTHIC_CEILING_WEIGHT);
  out.iconic = clampIconicWeight(out.iconic);
  return out;
}

export function effectivePityGrants(
  override?: RarityOverridePayload | null,
  fallback: ItemRarity = "legendary",
): ItemRarity {
  const value = override?.pityGrants ?? fallback;
  if (value === "mythic" || value === "iconic") return "legendary";
  return value;
}

const SET_IDS = new Set(Object.keys(STYLE_SETS) as StyleSetId[]);

export function validateStyleLuckOverride(
  input: unknown,
): StyleLuckOverridePayload {
  if (!input || typeof input !== "object") {
    throw new AdventureAdminValidationError("Style Luck override is required");
  }
  const raw = input as StyleLuckOverridePayload;
  const rarityPoints: Partial<Record<ItemRarity, number>> = {};
  if (raw.rarityPoints != null) {
    for (const [key, value] of Object.entries(raw.rarityPoints)) {
      if (!isItemRarity(key)) {
        throw new AdventureAdminValidationError(`Unknown rarity ${key}`);
      }
      const n = asInt(value, `${key} points`);
      if (n > 40) {
        throw new AdventureAdminValidationError(
          `${key} Style Luck points cannot exceed 40`,
        );
      }
      rarityPoints[key] = n;
    }
  }
  let multiplierCap: number | undefined;
  if (raw.multiplierCap != null) {
    const n = Number(raw.multiplierCap);
    if (!Number.isFinite(n) || n < 1 || n > STYLE_LUCK_MULTIPLIER_CAP) {
      throw new AdventureAdminValidationError(
        `multiplierCap must be between 1 and ${STYLE_LUCK_MULTIPLIER_CAP}`,
      );
    }
    multiplierCap = n;
  }
  const setBonusPoints: Partial<Record<StyleSetId, number>> = {};
  if (raw.setBonusPoints != null) {
    for (const [key, value] of Object.entries(raw.setBonusPoints)) {
      if (!SET_IDS.has(key as StyleSetId)) {
        throw new AdventureAdminValidationError(`Unknown style set ${key}`);
      }
      const n = asInt(value, `${key} set bonus`);
      if (n > 20) {
        throw new AdventureAdminValidationError(
          `${key} set bonus cannot exceed 20`,
        );
      }
      setBonusPoints[key as StyleSetId] = n;
    }
  }
  if (
    !Object.keys(rarityPoints).length &&
    multiplierCap == null &&
    !Object.keys(setBonusPoints).length
  ) {
    throw new AdventureAdminValidationError(
      "Style Luck override needs rarityPoints, multiplierCap, or setBonusPoints",
    );
  }
  return {
    rarityPoints: Object.keys(rarityPoints).length ? rarityPoints : undefined,
    multiplierCap,
    setBonusPoints: Object.keys(setBonusPoints).length
      ? setBonusPoints
      : undefined,
  };
}

export function mergeStyleLuckPoints(
  override?: StyleLuckOverridePayload | null,
): Record<ItemRarity, number> {
  const out = { ...STYLE_LUCK_RARITY_POINTS };
  if (override?.rarityPoints) {
    for (const rarity of ITEM_RARITIES) {
      const next = override.rarityPoints[rarity];
      if (typeof next === "number") out[rarity] = next;
    }
  }
  return out;
}

export function mergeStyleLuckCap(
  override?: StyleLuckOverridePayload | null,
): number {
  const cap = override?.multiplierCap ?? STYLE_LUCK_MULTIPLIER_CAP;
  return Math.max(1, Math.min(STYLE_LUCK_MULTIPLIER_CAP, cap));
}

export function validatePopupEvent(input: unknown): PopupEventPayload {
  if (!input || typeof input !== "object") {
    throw new AdventureAdminValidationError("Pop-Up event is required");
  }
  const raw = input as PopupEventPayload;
  const name = String(raw.name ?? "").trim();
  if (!name || name.length > 80) {
    throw new AdventureAdminValidationError(
      "Pop-Up name must be 1–80 characters",
    );
  }
  const startsAt = Number(raw.startsAt);
  const endsAt = Number(raw.endsAt);
  if (
    !Number.isFinite(startsAt) ||
    !Number.isFinite(endsAt) ||
    endsAt <= startsAt
  ) {
    throw new AdventureAdminValidationError(
      "Pop-Up window needs a start and a later end",
    );
  }
  const pool: PopupPoolItem[] = [];
  for (const row of raw.pool ?? []) {
    if (!row || typeof row !== "object") {
      throw new AdventureAdminValidationError("Invalid reward pool entry");
    }
    const itemId = String(row.itemId ?? "").trim();
    if (!itemId) {
      throw new AdventureAdminValidationError("Pool items need an itemId");
    }
    if (!isItemRarity(row.rarity)) {
      throw new AdventureAdminValidationError(
        `Pool item ${itemId} needs a rarity`,
      );
    }
    const qty = row.qty == null ? 1 : asInt(row.qty, "pool qty");
    if (qty < 1 || qty > 99) {
      throw new AdventureAdminValidationError("Pool qty must be 1–99");
    }
    pool.push({ itemId, rarity: row.rarity, qty });
  }
  const status = raw.status ?? "scheduled";
  if (status !== "scheduled" && status !== "live" && status !== "ended") {
    throw new AdventureAdminValidationError("Invalid Pop-Up status");
  }
  const id = raw.id && /^[a-z0-9-]{2,64}$/.test(raw.id) ? raw.id : undefined;
  if (raw.id && !id) {
    throw new AdventureAdminValidationError(
      "Pop-Up id must be lowercase kebab-case",
    );
  }
  return {
    id,
    name,
    description: String(raw.description ?? "").slice(0, 280),
    startsAt,
    endsAt,
    pool,
    status,
  };
}

export function popupStatusAt(
  event: { startsAt: number; endsAt: number; status: string },
  now: number,
): "scheduled" | "live" | "ended" {
  if (event.status === "ended") return "ended";
  if (now < event.startsAt) return "scheduled";
  if (now > event.endsAt) return "ended";
  return "live";
}

export function utcDayKey(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

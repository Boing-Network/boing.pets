/** Rarity presentation for the Dispatch reward reveal. */

import { isSellableItem } from "../market";
import {
  ITEM_RARITY_LABELS,
  MARKET_CATEGORY_LABELS,
  type ItemRarity,
  isItemRarity,
} from "../content/rarities";
import {
  itemDisplayName,
  itemMarketCategory,
  itemRarity,
  itemSource,
} from "../content/items";
import { ADVENTURE_EXCLUSIVE_ITEMS } from "../content/adventures";

export type RevealEffect =
  "stamp" | "flash" | "spark" | "pulse" | "holo" | "grail" | "vaulted";

export type AdventureRarityFx = {
  id: ItemRarity;
  name: string;
  color: string;
  effect: RevealEffect;
  holo: boolean;
  extraFlair: boolean;
};

export const ADVENTURE_RARITY_FX: Record<ItemRarity, AdventureRarityFx> = {
  common: {
    id: "common",
    name: "Street Pull",
    color: "#c8c8c0",
    effect: "stamp",
    holo: false,
    extraFlair: false,
  },
  uncommon: {
    id: "uncommon",
    name: "Corner Find",
    color: "#3ecf8e",
    effect: "flash",
    holo: false,
    extraFlair: false,
  },
  rare: {
    id: "rare",
    name: "Heat Check",
    color: "#3aa0ff",
    effect: "spark",
    holo: false,
    extraFlair: false,
  },
  epic: {
    id: "epic",
    name: "Block Legend",
    color: "#a85cff",
    effect: "pulse",
    holo: false,
    extraFlair: false,
  },
  legendary: {
    id: "legendary",
    name: "Night Fall",
    color: "#ffb000",
    effect: "holo",
    holo: true,
    extraFlair: false,
  },
  mythic: {
    id: "mythic",
    name: "Grail",
    color: "#ff4d00",
    effect: "grail",
    holo: true,
    extraFlair: true,
  },
  iconic: {
    id: "iconic",
    name: "Vaulted",
    color: "#f5f5f0",
    effect: "vaulted",
    holo: true,
    extraFlair: true,
  },
};

export type AdventureMintStatus = "pending" | "confirmed" | "failed" | "none";

export type AdventureRevealReward = {
  name: string;
  rarity: ItemRarity | string;
  rarityName: string;
  color: string;
  effect: RevealEffect;
  holo: boolean;
  extraFlair: boolean;
  category: string;
  dropSource: string;
  previewItemId: string | null;
  tradeable: boolean;
  collectible: boolean;
  bound: boolean;
  ownership: string;
  acquiredAt: number | null;
  ownerCount: number | null;
  mintStatus: AdventureMintStatus;
  qty: number;
};

export function rarityFx(rarity: string | null | undefined): AdventureRarityFx {
  if (rarity && isItemRarity(rarity)) return ADVENTURE_RARITY_FX[rarity];
  return ADVENTURE_RARITY_FX.common;
}

export function rarityStickerSvg(rarity: string | null | undefined): string {
  const fx = rarityFx(rarity);
  const mark =
    fx.id === "common"
      ? '<rect x="7" y="10" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 14h18" fill="none" stroke="currentColor" stroke-width="2"/>'
      : fx.id === "uncommon"
        ? '<path d="M16 6l8 10-8 10-8-10z" fill="currentColor"/>'
        : fx.id === "rare"
          ? '<path d="M16 5l3 8h8l-6.5 5 2.5 8L16 21l-7 5 2.5-8L5 13h8z" fill="currentColor"/>'
          : fx.id === "epic"
            ? '<circle cx="16" cy="16" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 8v16M8 16h16" stroke="currentColor" stroke-width="2"/>'
            : fx.id === "legendary"
              ? '<path d="M8 20c2-8 4-12 8-12s6 4 8 12H8z" fill="currentColor"/><circle cx="16" cy="8" r="3" fill="currentColor"/>'
              : fx.id === "mythic"
                ? '<path d="M8 10h16l-2 6H10L8 10zm3 6v6h10v-6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 10c0-3 8-3 8 0" fill="none" stroke="currentColor" stroke-width="2"/>'
                : '<rect x="7" y="8" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="16" cy="16" r="3" fill="currentColor"/>';
  return (
    '<svg class="adventure-rarity-sticker rarity-' +
    fx.id +
    '" viewBox="0 0 32 32" width="48" height="48" aria-hidden="true" style="color:' +
    fx.color +
    '"><title>' +
    fx.name +
    "</title>" +
    mark +
    "</svg>"
  );
}

export function displayRarityName(rarity: string | null | undefined): string {
  const fx = rarityFx(rarity);
  if (rarity && isItemRarity(rarity)) {
    if (rarity === "mythic" || rarity === "iconic") return fx.name;
    return `${fx.name} · ${ITEM_RARITY_LABELS[rarity]}`;
  }
  return fx.name;
}

export function ownershipLabel(input: {
  tradeable: boolean;
  collectible: boolean;
  bound: boolean;
}): string {
  if (input.bound) return "Bound";
  const parts: string[] = [];
  if (input.tradeable) parts.push("Tradeable");
  if (input.collectible) parts.push("Collectible");
  return parts.join(" / ") || "Bound";
}

export function normalizeMintStatus(
  raw: string | null | undefined,
): AdventureMintStatus {
  if (!raw || raw === "none" || raw === "skipped" || raw === "not_configured")
    return raw === "pending" ? "pending" : raw === "failed" ? "failed" : "none";
  if (
    raw === "pending" ||
    raw === "queued" ||
    raw === "signing" ||
    raw === "submitted"
  )
    return "pending";
  if (raw === "minted" || raw === "confirmed") return "confirmed";
  if (raw === "failed" || raw === "unmapped_item") return "failed";
  return "none";
}

export function buildAdventureReveal(input: {
  gameItemId?: string | null;
  name?: string;
  rarity?: string | null;
  kind?: string | null;
  currency?: string | null;
  qty?: number;
  dropSource?: string;
  acquiredAt?: number | null;
  ownerCount?: number | null;
  mintStatus?: string | null;
}): AdventureRevealReward {
  const itemId = input.gameItemId ?? null;
  const exclusive = itemId ? ADVENTURE_EXCLUSIVE_ITEMS[itemId] : undefined;
  const rarity =
    (input.rarity && isItemRarity(input.rarity) && input.rarity) ||
    (itemId && itemRarity(itemId)) ||
    "common";
  const fx = rarityFx(rarity);
  const category =
    (itemId &&
      itemMarketCategory(itemId) &&
      MARKET_CATEGORY_LABELS[itemMarketCategory(itemId)!]) ||
    (input.kind === "currency"
      ? "Currency"
      : input.kind === "xp"
        ? "XP"
        : input.kind === "material"
          ? "Material"
          : input.kind === "consolation"
            ? "Consolation"
            : "Drop");
  const tradeable = itemId
    ? isSellableItem(itemId) || exclusive?.tradeable === true
    : false;
  const collectible = Boolean(
    exclusive?.tags.includes("collectible") ||
    exclusive?.tags.includes("secret") ||
    (itemId &&
      (itemId.startsWith("secret-") ||
        itemId.startsWith("collectible-") ||
        itemId.startsWith("grail-") ||
        itemId.startsWith("vaulted-"))),
  );
  const bound = Boolean(itemId) && !tradeable;
  return {
    name:
      input.name ||
      (itemId
        ? itemDisplayName(itemId)
        : input.currency || input.kind || "Reward"),
    rarity,
    rarityName: displayRarityName(rarity),
    color: fx.color,
    effect: fx.effect,
    holo: fx.holo,
    extraFlair: fx.extraFlair,
    category,
    dropSource: input.dropSource || (itemId ? itemSource(itemId) : "Dispatch"),
    previewItemId: itemId,
    tradeable,
    collectible,
    bound,
    ownership: ownershipLabel({ tradeable, collectible, bound }),
    acquiredAt: input.acquiredAt ?? null,
    ownerCount: input.ownerCount ?? null,
    mintStatus: itemId ? normalizeMintStatus(input.mintStatus) : "none",
    qty: input.qty ?? 1,
  };
}

export function adventureRevealClassName(
  reward: AdventureRevealReward,
): string {
  const bits = [
    "reward-card",
    "adventure-reveal",
    `is-${reward.effect}`,
    `rarity-${reward.rarity}`,
  ];
  if (reward.holo) bits.push("has-holo");
  if (reward.extraFlair) bits.push("has-flair");
  return bits.join(" ");
}

export function formatAcquiredAt(
  at: number | null,
  zone = "America/New_York",
): string {
  if (!at) return "Just now";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(at));
  } catch {
    return new Date(at).toLocaleString();
  }
}

export function formatOwnerCount(count: number | null): string {
  if (count == null) return "Unknown owners";
  if (count === 1) return "1 owner";
  return `${count} owners`;
}

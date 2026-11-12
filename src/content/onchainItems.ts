/**
 * Optional on-chain withdrawal of mined resources into a Boing reference multi-token v1
 * contract (ERC-1155-style shared item types, see boing.network docs/BOING-REFERENCE-MULTI-TOKEN.md).
 *
 * Off-chain inventory stays the source of truth for play. A withdrawal moves a stack out of
 * the D1 inventory and credits the player's wallet. If the operator already holds a balance
 * of that item id (from earlier deposits), the operator transfers it; only the shortfall is
 * minted, so a withdraw+deposit round trip does not inflate totalSupply. A deposit is a
 * player-signed transfer of those items back to the Pets operator; the Worker verifies the
 * receipt and credits inventory once per tx hash. On-chain item ids are permanent: never
 * renumber or reuse one. Some ids are reserved and stay unmapped (see
 * ONCHAIN_RESERVED_ITEM_IDS).
 *
 * Calldata, storage keys, and storage-word parsing come from `@boing-network/boing-sdk`.
 */

import {
  REF_MT_ADMIN_KEY_HEX,
  SELECTOR_MT_MINT,
  encodeMultiTokenMintCalldata,
  encodeMultiTokenTransferCalldata,
  multiTokenAmountFromStorageWord,
  multiTokenBalanceStorageKey,
} from "@boing-network/boing-sdk";

export type OnchainItemCategory =
  "ore" | "fish" | "treasure" | "crop" | "food" | "material" | "cosmetic";

export interface OnchainItemDef {
  /** Off-chain inventory id (`inventory.item_id`). */
  gameItemId: string;
  /** u64 item id inside the multi-token contract. Permanent: never renumber or reuse. */
  itemId: number;
  name: string;
  category: OnchainItemCategory;
}

/**
 * Fixed item-id table for every stackable, tradable inventory item.
 * New ids fill reserved gaps in each band (ores 4-5, fish 13-14, loot 23-24,
 * crops 33-34, food 43-44, tools 63, cosmetics 77-79).
 * Gaps between bands are reserved for future items in that category.
 * Pets stay unique NFTs (not listed here). Species/discovery collection
 * entries and cook-book recipe defs are achievements or recipes, not inventory
 * stacks, and stay off-chain. Race ribbons (ids 50-52) stay off-chain so
 * placements cannot be bought. The starter Wood Pick (id 60) stays off-chain
 * because every player starts with one and withdrawing it would mint unlimited
 * copies. Those ids are reserved and must never be reused.
 */
export const ONCHAIN_ITEMS: readonly OnchainItemDef[] = [
  {
    gameItemId: "ore-pebble",
    itemId: 1,
    name: "Pasture Pebble",
    category: "ore",
  },
  { gameItemId: "ore-spark", itemId: 2, name: "Spark Ore", category: "ore" },
  {
    gameItemId: "ore-crystal",
    itemId: 3,
    name: "Boing Crystal",
    category: "ore",
  },
  { gameItemId: "ore-emberite", itemId: 4, name: "Emberite", category: "ore" },
  {
    gameItemId: "ore-aetherite",
    itemId: 5,
    name: "Aetherite",
    category: "ore",
  },
  {
    gameItemId: "fish-ripple",
    itemId: 10,
    name: "Ripple Minnow",
    category: "fish",
  },
  {
    gameItemId: "fish-boingfin",
    itemId: 11,
    name: "Boingfin",
    category: "fish",
  },
  {
    gameItemId: "fish-moonkoi",
    itemId: 12,
    name: "Moon Koi",
    category: "fish",
  },
  {
    gameItemId: "fish-copperfin",
    itemId: 13,
    name: "Copperfin",
    category: "fish",
  },
  {
    gameItemId: "fish-starfin",
    itemId: 14,
    name: "Starfin",
    category: "fish",
  },
  {
    gameItemId: "loot-pebble",
    itemId: 20,
    name: "Lucky Pebble",
    category: "treasure",
  },
  {
    gameItemId: "loot-map-scrap",
    itemId: 21,
    name: "Map Scrap",
    category: "treasure",
  },
  {
    gameItemId: "loot-sun-shard",
    itemId: 22,
    name: "Sun Shard",
    category: "treasure",
  },
  {
    gameItemId: "loot-wind-bell",
    itemId: 23,
    name: "Wind Bell",
    category: "treasure",
  },
  {
    gameItemId: "loot-comet-bead",
    itemId: 24,
    name: "Comet Bead",
    category: "treasure",
  },
  {
    gameItemId: "crop-sprout",
    itemId: 30,
    name: "Bounce Sprout",
    category: "crop",
  },
  {
    gameItemId: "crop-berry",
    itemId: 31,
    name: "Pasture Berry",
    category: "crop",
  },
  {
    gameItemId: "crop-moonbloom",
    itemId: 32,
    name: "Moonbloom",
    category: "crop",
  },
  {
    gameItemId: "crop-honeyroot",
    itemId: 33,
    name: "Honeyroot",
    category: "crop",
  },
  {
    gameItemId: "crop-starglider",
    itemId: 34,
    name: "Starglider Bloom",
    category: "crop",
  },
  {
    gameItemId: "food-sprout-salad",
    itemId: 40,
    name: "Sprout Salad",
    category: "food",
  },
  {
    gameItemId: "food-berry-glaze",
    itemId: 41,
    name: "Berry Glaze Fish",
    category: "food",
  },
  {
    gameItemId: "food-moon-feast",
    itemId: 42,
    name: "Moon Feast",
    category: "food",
  },
  {
    gameItemId: "food-honey-tart",
    itemId: 43,
    name: "Honeyroot Tart",
    category: "food",
  },
  {
    gameItemId: "food-starlit",
    itemId: 44,
    name: "Starlit Broth",
    category: "food",
  },
  {
    gameItemId: "tool-pick-iron",
    itemId: 61,
    name: "Iron Pick",
    category: "material",
  },
  {
    gameItemId: "tool-pick-crystal",
    itemId: 62,
    name: "Crystal Pick",
    category: "material",
  },
  {
    gameItemId: "tool-pick-aether",
    itemId: 63,
    name: "Aether Pick",
    category: "material",
  },
  {
    gameItemId: "hat-ribbon",
    itemId: 70,
    name: "Pasture Ribbon",
    category: "cosmetic",
  },
  {
    gameItemId: "hat-antenna",
    itemId: 71,
    name: "Glow Antenna",
    category: "cosmetic",
  },
  {
    gameItemId: "hat-stardust",
    itemId: 72,
    name: "Stardust Halo",
    category: "cosmetic",
  },
  {
    gameItemId: "frame-gold",
    itemId: 73,
    name: "Gold Card Frame",
    category: "cosmetic",
  },
  {
    gameItemId: "frame-aurora",
    itemId: 74,
    name: "Aurora Frame",
    category: "cosmetic",
  },
  {
    gameItemId: "furn-cushion",
    itemId: 75,
    name: "Bounce Cushion",
    category: "cosmetic",
  },
  {
    gameItemId: "furn-lamp",
    itemId: 76,
    name: "Meadow Lamp",
    category: "cosmetic",
  },
  {
    gameItemId: "hat-leaf",
    itemId: 77,
    name: "Leaf Cap",
    category: "cosmetic",
  },
  {
    gameItemId: "furn-lantern",
    itemId: 78,
    name: "Glow Lantern",
    category: "cosmetic",
  },
  {
    gameItemId: "hat-comet",
    itemId: 79,
    name: "Comet Pin",
    category: "cosmetic",
  },
];

/** Ids that must stay unused so they are never reassigned to a new item. */
export const ONCHAIN_RESERVED_ITEM_IDS: readonly {
  itemId: number;
  gameItemId: string;
  reason: string;
}[] = [
  {
    itemId: 50,
    gameItemId: "ribbon-gold",
    reason:
      "Race ribbons stay off-chain achievements so placements cannot be bought.",
  },
  {
    itemId: 51,
    gameItemId: "ribbon-silver",
    reason:
      "Race ribbons stay off-chain achievements so placements cannot be bought.",
  },
  {
    itemId: 52,
    gameItemId: "ribbon-bronze",
    reason:
      "Race ribbons stay off-chain achievements so placements cannot be bought.",
  },
  {
    itemId: 60,
    gameItemId: "tool-pick-wood",
    reason:
      "Every player starts with a free Wood Pick, so withdrawing it would let anyone mint unlimited copies.",
  },
];

/** Largest quantity one withdrawal can mint (keeps abuse and refunds small). */
export const ONCHAIN_WITHDRAW_MAX_QTY = 100;

export function onchainItemByGameId(id: string): OnchainItemDef | undefined {
  return ONCHAIN_ITEMS.find((i) => i.gameItemId === id);
}

export function onchainItemByItemId(id: number): OnchainItemDef | undefined {
  return ONCHAIN_ITEMS.find((i) => i.itemId === id);
}

const strip = (h: string) => h.replace(/^0x/i, "").toLowerCase();

export function hex64(h: string): string {
  const s = strip(h);
  if (!/^[0-9a-f]{64}$/.test(s)) throw new Error("Expected a 32-byte hex id");
  return s;
}

export const MT_ADMIN_STORAGE_KEY = REF_MT_ADMIN_KEY_HEX;
export const MT_SELECTOR_MINT = SELECTOR_MT_MINT;

export function bytesToHex(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}

/** `balance_of` storage key: `(account[0..24] || itemId_be8) ^ "BOING_REFMT_BAL_V1"`. */
export function mtBalanceStorageKey(account: string, itemId: number): string {
  return multiTokenBalanceStorageKey(account, itemId);
}

/** 128-byte `mint(to, itemId, amount)` calldata (admin only). */
export function mtMintCalldata(
  to: string,
  itemId: number,
  amount: number,
): Uint8Array {
  if (!Number.isSafeInteger(itemId) || itemId < 0)
    throw new Error("Invalid item id");
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new Error("Invalid amount");
  return encodeMultiTokenMintCalldata(to, itemId, amount);
}

/** 128-byte `transfer(to, itemId, amount)` calldata (caller's own balance). */
export function mtTransferCalldata(
  to: string,
  itemId: number,
  amount: number,
): Uint8Array {
  if (!Number.isSafeInteger(itemId) || itemId < 0)
    throw new Error("Invalid item id");
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new Error("Invalid amount");
  return encodeMultiTokenTransferCalldata(to, itemId, amount);
}

/** Parse a `boing_getContractStorage` result (`{ value }` or bare hex) as a word. */
export function storageWordHex(result: unknown): string {
  let raw: unknown = result;
  if (raw && typeof raw === "object" && "value" in raw)
    raw = (raw as { value: unknown }).value;
  if (typeof raw !== "string") return "00".repeat(32);
  const s = strip(raw);
  return /^[0-9a-f]{64}$/.test(s) ? s : "00".repeat(32);
}

/** Storage word as a JS number quantity (saturates at MAX_SAFE_INTEGER). */
export function storageWordQty(result: unknown): number {
  const n = multiTokenAmountFromStorageWord(result);
  return n > BigInt(Number.MAX_SAFE_INTEGER)
    ? Number.MAX_SAFE_INTEGER
    : Number(n);
}

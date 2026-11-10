/** Player market rules: testnet BOING pricing, sellable sets, fees, limits. */

import {
  parseBoing,
  formatBoing,
  BOING_DECIMALS,
} from "@boing-network/boing-sdk";
import { CATALOG } from "./economy";
import {
  ONCHAIN_ITEMS,
  ONCHAIN_RESERVED_ITEM_IDS,
} from "./content/onchainItems";

/** 5% sink, same bps as the existing Boinglets book. */
export const LISTING_FEE_BPS = 500;

/** Pets operator: escrow payee for a verified native BOING payment. */
export const MARKET_ESCROW_ADDRESS =
  "0xc8b386c732a9f00c7ccd28aa4a8c377634057d6b5604099f4809a8fee58af6f8";

/** Off-chain ledger name for the fee bookkeeping row. */
export const MARKET_SINK_OWNER = "boing-pets-sink";

export const MARKET_MAX_OPEN_LISTINGS = 8;
export const MARKET_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
export const MARKET_HOLD_MS = 24 * 60 * 60 * 1000;
export const MARKET_SELLBACK_MS = 2 * 60 * 60 * 1000;
export const MARKET_MAX_LIST_OPENS_PER_UTC_DAY = 10;
export const MARKET_MAX_FILLS_PER_UTC_DAY = 10;
export const MARKET_QTY_MIN = 1;
export const MARKET_QTY_MAX = 20;

/** Provisional price band in whole BOING, stored as 18-decimal base units. */
export const MARKET_MIN_BOING = "0.01";
export const MARKET_MAX_BOING = "100000";

export const MARKET_PRICE_CURRENCY = "boing" as const;

const UNSALEABLE_GAME_IDS = new Set<string>([
  "tool-pick-wood",
  ...ONCHAIN_RESERVED_ITEM_IDS.map((row) => row.gameItemId),
]);

const SELLABLE_IDS = new Set([
  ...CATALOG.map((item) => item.id),
  ...ONCHAIN_ITEMS.map((item) => item.gameItemId).filter(
    (id) => !UNSALEABLE_GAME_IDS.has(id),
  ),
]);

export type MarketListDenial =
  | "not-sellable"
  | "unsaleable-reserved"
  | "invalid-qty"
  | "invalid-price"
  | "too-many-open"
  | "hold"
  | "velocity"
  | "equipped"
  | "placed"
  | "insufficient";

export function isSellableItem(itemId: string): boolean {
  if (UNSALEABLE_GAME_IDS.has(itemId)) return false;
  if (itemId.startsWith("ribbon-")) return false;
  if (itemId === "tool-pick-wood") return false;
  return SELLABLE_IDS.has(itemId);
}

export function parseMarketPriceBoing(text: string): bigint {
  const value = parseBoing(String(text).trim());
  const min = parseBoing(MARKET_MIN_BOING);
  const max = parseBoing(MARKET_MAX_BOING);
  if (value < min || value > max) {
    throw new Error(
      `Price must be between ${MARKET_MIN_BOING} and ${MARKET_MAX_BOING} testnet BOING`,
    );
  }
  return value;
}

export function formatMarketPriceBoing(baseUnits: bigint | string): string {
  return formatBoing(baseUnits);
}

export function listingFeeBaseUnits(price: bigint): bigint {
  const fee = (price * BigInt(LISTING_FEE_BPS)) / 10_000n;
  return fee < 1n ? 1n : fee;
}

export function sellerProceedsBaseUnits(price: bigint): bigint {
  return price - listingFeeBaseUnits(price);
}

export function utcDayStart(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function listingExpiresAt(createdAt: number): number {
  return createdAt + MARKET_EXPIRY_MS;
}

export function stillInHold(
  acquiredAt: number | null | undefined,
  now: number,
): boolean {
  if (!acquiredAt) return false;
  return now - acquiredAt < MARKET_HOLD_MS;
}

export function isImmediateSellback(
  previousSeller: string | null | undefined,
  buyer: string,
  acquiredAt: number | null | undefined,
  now: number,
): boolean {
  if (!previousSeller || !acquiredAt) return false;
  if (previousSeller !== buyer) return false;
  return now - acquiredAt < MARKET_SELLBACK_MS;
}

export function validateListQty(qty: number): boolean {
  return (
    Number.isSafeInteger(qty) && qty >= MARKET_QTY_MIN && qty <= MARKET_QTY_MAX
  );
}

export const MARKET_BOING_DECIMALS = BOING_DECIMALS;

export function publicMarketRules() {
  return {
    currency: MARKET_PRICE_CURRENCY,
    decimals: BOING_DECIMALS,
    feeBps: LISTING_FEE_BPS,
    escrow: MARKET_ESCROW_ADDRESS,
    minPriceBoing: MARKET_MIN_BOING,
    maxPriceBoing: MARKET_MAX_BOING,
    qtyMin: MARKET_QTY_MIN,
    qtyMax: MARKET_QTY_MAX,
    maxOpenListings: MARKET_MAX_OPEN_LISTINGS,
    expiryDays: 7,
    holdMs: MARKET_HOLD_MS,
    sellbackMs: MARKET_SELLBACK_MS,
    maxListOpensPerUtcDay: MARKET_MAX_LIST_OPENS_PER_UTC_DAY,
    maxFillsPerUtcDay: MARKET_MAX_FILLS_PER_UTC_DAY,
    provisional: true,
    settlement:
      "escrow-to-operator: buyer pays the full testnet BOING price to the Pets operator in one native transfer; the worker verifies the receipt, then releases the item and records 95% seller / 5% sink payouts",
  };
}

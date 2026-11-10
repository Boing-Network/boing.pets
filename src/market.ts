/** Player market rules: testnet BOING pricing, sellable sets, fees, limits. */

import {
  parseBoing,
  formatBoing,
  BOING_DECIMALS,
  estimateMicroTransferFee,
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

/**
 * Minimum TOTAL listing price in testnet BOING (18-decimal base units).
 * Chosen so the 5% fee (0.005 BOING) is about 11.9x the two payout
 * transfer fees measured on official testnet on 2026-11-10.
 * This does not replenish operator gas: the 5% is paid out to the
 * pasture treasury, and payout network fees come from operator surplus.
 */
export const MARKET_MIN_BOING = "0.1";
export const MARKET_MAX_BOING = "100000";

/** Live official-testnet receipts: native Transfer gas_used is 21000. */
export const NATIVE_TRANSFER_GAS_USED = 21000n;

/**
 * Untipped native transfer fee: gas_used * 1e12 * 100 / 10000 = 0.00021
 * BOING. Matches `estimateMicroTransferFee()`, `execution_gas_fee_bps=100`,
 * `gas_price_base_units=1000000000000`, `extra_fixed_fee=0`, and
 * `transfer_amount_bps=0` from boing_getNetworkInfo on 2026-11-10.
 */
export const NATIVE_TRANSFER_FEE_BASE_UNITS = estimateMicroTransferFee();
export const PAYOUT_LEGS_PER_FILL = 2;
export const PAYOUT_NETWORK_FEE_BUDGET_BASE_UNITS =
  NATIVE_TRANSFER_FEE_BASE_UNITS * BigInt(PAYOUT_LEGS_PER_FILL);

/**
 * Budgeted gas per payout leg for reserve math: 4x the measured micro fee
 * (0.00084 BOING). A later small fee-policy bump should not immediately
 * exhaust the reserve. Not a source of operator gas.
 */
export const MARKET_GAS_BUDGET_PER_LEG_BASE_UNITS =
  NATIVE_TRANSFER_FEE_BASE_UNITS * 4n;

/** Surplus that must remain after admitting a purchase. */
export const MARKET_GAS_RESERVE_FLOOR_BOING = "0.01";

export const MARKET_PURCHASES_PAUSED_MESSAGE =
  "Market purchases are paused until the operator has enough testnet BOING reserved for payout network fees. The 5% sale fee does not replenish that reserve.";

export const MARKET_WRITES_DISABLED_MESSAGE =
  "Market listings and purchases are temporarily disabled. Outstanding payouts are unchanged.";

export function marketGasReserveFloor(): bigint {
  return parseBoing(MARKET_GAS_RESERVE_FLOOR_BOING);
}

export function operatorSurplus(
  operatorBalance: bigint,
  pendingPayoutAmounts: bigint,
): bigint {
  const surplus = operatorBalance - pendingPayoutAmounts;
  return surplus > 0n ? surplus : 0n;
}

export function gasReserveRequiredBaseUnits(
  pendingLegs: number,
  extraLegs = 0,
): bigint {
  const legs = BigInt(Math.max(0, pendingLegs) + Math.max(0, extraLegs));
  return legs * MARKET_GAS_BUDGET_PER_LEG_BASE_UNITS + marketGasReserveFloor();
}

export type MarketGasReserve = {
  ok: boolean;
  surplus: bigint;
  required: bigint;
  pendingLegs: number;
  pendingPayoutAmounts: bigint;
};

export function canAdmitMarketPurchase(input: {
  operatorBalance: bigint;
  pendingPayoutAmounts: bigint;
  pendingLegs: number;
  extraLegs?: number;
}): MarketGasReserve {
  const extraLegs = input.extraLegs ?? PAYOUT_LEGS_PER_FILL;
  const surplus = operatorSurplus(
    input.operatorBalance,
    input.pendingPayoutAmounts,
  );
  const required = gasReserveRequiredBaseUnits(input.pendingLegs, extraLegs);
  return {
    ok: surplus >= required,
    surplus,
    required,
    pendingLegs: input.pendingLegs,
    pendingPayoutAmounts: input.pendingPayoutAmounts,
  };
}

/** Balance needed to submit one payout leg, including the measured network fee. */
export function payoutSubmitBalanceRequired(amount: bigint): bigint {
  return amount + NATIVE_TRANSFER_FEE_BASE_UNITS;
}

export function marketWritesEnabled(env: { MARKET_WRITES?: string }): boolean {
  const raw = String(env.MARKET_WRITES ?? "on")
    .trim()
    .toLowerCase();
  return raw !== "off" && raw !== "disabled" && raw !== "0" && raw !== "false";
}

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

/** Floor the 5% fee; any integer remainder stays with the seller. */
export function listingFeeBaseUnits(price: bigint): bigint {
  if (price <= 0n) throw new Error("Price must be positive");
  return (price * BigInt(LISTING_FEE_BPS)) / 10_000n;
}

export function sellerProceedsBaseUnits(price: bigint): bigint {
  return price - listingFeeBaseUnits(price);
}

/** Exact 95/5 split in base units. fee + seller === price. */
export function payoutSplit(price: bigint): { fee: bigint; seller: bigint } {
  const fee = listingFeeBaseUnits(price);
  const seller = price - fee;
  return { fee, seller };
}

/** On-chain pasture treasury that receives the 5% native BOING fee. */
export const MARKET_SINK_ADDRESS =
  "0x67714f1d05f3f50b2676d57616036b871b3238bc1d5a5259d0607bf147cc4122";

export const MARKET_EXPLORER_TX_BASE = "https://boing.observer/tx/";

export function marketPayoutId(
  paymentTx: string,
  kind: "seller" | "sink",
): string {
  return `${paymentTx}:${kind}`;
}

export function marketPayoutTxUrl(
  txHash: string | null | undefined,
): string | null {
  if (!txHash) return null;
  return MARKET_EXPLORER_TX_BASE + txHash;
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
    sink: MARKET_SINK_ADDRESS,
    nativeTransferFeeBoing: formatBoing(NATIVE_TRANSFER_FEE_BASE_UNITS),
    payoutNetworkFeeBudgetBoing: formatBoing(
      PAYOUT_NETWORK_FEE_BUDGET_BASE_UNITS,
    ),
    gasReserveFloorBoing: MARKET_GAS_RESERVE_FLOOR_BOING,
    gasBudgetPerLegBoing: formatBoing(MARKET_GAS_BUDGET_PER_LEG_BASE_UNITS),
    settlement:
      "escrow-to-operator: buyer pays the full testnet BOING price to the Pets operator in one native transfer; the worker verifies the receipt, releases the item, and the operator pays 95% to the seller and 5% to the pasture treasury as native BOING transfers",
    feeAssumptions:
      "Official testnet 2026-11-10: native Transfer gas_used=21000, execution_gas_fee_bps=100, gas_price_base_units=1000000000000, extra_fixed_fee=0, transfer_amount_bps=0, payouts untipped. Fee per transfer is 0.00021 BOING; two payout legs cost 0.00042 BOING. The 0.1 minimum listing makes the 5% fee 0.005 BOING, about 11.9 times that budget. Revisit if the fee policy changes.",
    gasSubsidy:
      "The 5% fee is paid to the pasture treasury and does not replenish operator gas. Payout network fees are paid from operator surplus. New purchases pause if that surplus would fall below the gas reserve floor after the two new payout legs.",
  };
}

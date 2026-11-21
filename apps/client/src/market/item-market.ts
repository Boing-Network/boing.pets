/**
 * LPIT item market: what each row offers the connected wallet. Pure, so the
 * rules are tested without a DOM (apps/client/test/market-items.test.ts).
 */
import type {
  MarketItemHolding,
  MarketItemListing,
  MarketItemsResponse,
} from "@boing-pets/contract";

export type ItemListingOffer =
  | { kind: "BUY"; max: number }
  | { kind: "CANCEL" }
  /** Some listed units were already used in the world: not offered. */
  | { kind: "UNBACKED"; backed: number }
  /** The server has not locked the seller's units yet. */
  | { kind: "PENDING" }
  | { kind: "CONNECT" };

export function itemListingOffer(
  l: MarketItemListing,
  wallet: string | null,
): ItemListingOffer {
  if (wallet != null && l.sellerHex.toLowerCase() === wallet.toLowerCase()) {
    return { kind: "CANCEL" };
  }
  if (!l.reconciled) return { kind: "PENDING" };
  if (l.backed < l.remaining) return { kind: "UNBACKED", backed: l.backed };
  if (wallet == null) return { kind: "CONNECT" };
  return { kind: "BUY", max: l.remaining };
}

/** Whole number 1..max, or null. */
export function parseQty(text: string, max: number): number | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= max ? n : null;
}

/** Holdings the wallet can list now. */
export function listableHoldings(
  res: MarketItemsResponse | null,
): MarketItemHolding[] {
  return (res?.wallet?.holdings ?? []).filter((h) => h.tradable > 0);
}

/** Why a holding cannot be listed (null when it can). */
export function holdingBlock(h: MarketItemHolding): string | null {
  if (h.tradable > 0) return null;
  if (h.chain == null) return "Couldn't read your LPIT balance right now.";
  if (h.chain === 0) return "None in your wallet on chain.";
  if (h.usable === 0) {
    return "Used in the world already: LPIT has no burn, so used units stay in the wallet but can't be traded.";
  }
  return "Nothing tradable.";
}

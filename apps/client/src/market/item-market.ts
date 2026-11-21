/**
 * LPIT item market: what each row offers the connected wallet. Pure, so the
 * rules are tested without a DOM (apps/client/test/market-items.test.ts).
 */
import type {
  MarketItemHolding,
  MarketItemListing,
  MarketItemsResponse,
  MarketMintInfo,
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
  if ((h.minting ?? 0) > 0) {
    return "Minting: the units arrive in your wallet within a minute or two.";
  }
  if (h.chain == null) return "Couldn't read your LPIT balance right now.";
  if (h.chain === 0) {
    return (h.unminted ?? 0) > 0
      ? "Not minted yet: mint them to your wallet first."
      : "None in your wallet on chain.";
  }
  if (h.usable === 0) {
    return "Used in the world already: LPIT has no burn, so used units stay in the wallet but can't be traded.";
  }
  return "Nothing tradable.";
}

/** Rows worth showing: anything held, minted, minting or listed. */
export function visibleHoldings(
  holdings: readonly MarketItemHolding[],
): MarketItemHolding[] {
  return holdings.filter(
    (h) =>
      (h.chain ?? 0) > 0 ||
      h.usable > 0 ||
      h.listed > 0 ||
      (h.unminted ?? 0) > 0 ||
      (h.minting ?? 0) > 0,
  );
}

export type MintOffer =
  | { kind: "MINT"; max: number }
  /** Units to mint, but the server says no right now. */
  | { kind: "BLOCKED"; reason: string }
  /** Nothing unminted (or an older server without mint on demand). */
  | { kind: "NONE" };

/** Whether the wallet can mint this holding now, and how many at most. */
export function mintOffer(
  h: MarketItemHolding,
  mint: MarketMintInfo | undefined,
): MintOffer {
  const unminted = h.unminted ?? 0;
  if (mint == null || unminted <= 0) return { kind: "NONE" };
  if (!mint.enabled) return { kind: "BLOCKED", reason: mint.note };
  if (mint.requestsLeft != null && mint.requestsLeft <= 0) {
    return {
      kind: "BLOCKED",
      reason: `You've used today's ${mint.maxRequestsPerDay} mints; try again tomorrow.`,
    };
  }
  return { kind: "MINT", max: Math.min(unminted, mint.maxQty) };
}

/** After Mint & List: the minted units are in the wallet and listable. */
export function readyToList(
  res: MarketItemsResponse | null,
  itemId: number,
  qty: number,
): MarketItemHolding | null {
  const h = res?.wallet?.holdings.find((row) => row.itemId === itemId);
  return h != null && h.tradable >= qty ? h : null;
}

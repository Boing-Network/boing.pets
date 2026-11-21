/**
 * LPIT item market index. Every refresh reads the item escrow's `config`
 * (fee, last listing id), every listing that is open or not yet reconciled,
 * and any fills not read before, as read-only `boing_simulateContractCall`s
 * (batches of at most 32, see `rpcReadBatch`). Then it hands the chain state
 * to the item service, which locks, credits and returns in-game units (see
 * items/escrow-reconcile.ts). Nothing is signed or submitted.
 *
 * Served at `GET /market/v1/items`; `?wallet=0x…` adds that wallet's LPIT
 * balances (chain), usable units (world inventory) and open listings.
 */
import {
  MARKET_API_VERSION,
  decodeItemEscrowConfig,
  decodeItemEscrowFill,
  decodeItemEscrowListing,
  decodeMultiTokenBalance,
  itemDef,
  itemEscrowCalldata,
  LPIT_ITEM_IDS,
  lpitItemSlug,
  multiTokenCalldata,
  type ItemEscrowConfig,
  type ItemEscrowListing,
  type MarketItemHolding,
  type MarketItemListing,
  type MarketItemsResponse,
} from "@boing-pets/contract";
import type {
  ChainItemListing,
  ItemListingStatus,
} from "../items/escrow-reconcile";
import type { ReadBatch, ReadCall } from "./listings";

export type ItemListingIndex = {
  refresh(): Promise<void>;
  /** Open listings and fee config from the last good refresh. */
  snapshot(): ItemIndexSnapshot;
  response(wallet: string | null): Promise<MarketItemsResponse>;
  start(): void;
  stop(): void;
};

export type ItemIndexSnapshot = {
  config: ItemEscrowConfig | null;
  listings: ReadonlyMap<number, ItemEscrowListing>;
  status: ReadonlyMap<number, ItemListingStatus>;
  refreshedAtMs: number | null;
  error: string | null;
};

const itemName = (itemId: number) => {
  const slug = lpitItemSlug(itemId);
  return (
    (slug != null ? itemDef(slug)?.displayName : null) ?? `Item #${itemId}`
  );
};

export function createItemListingIndex(input: {
  itemEscrowHex: string;
  collectionHex: string;
  read: ReadBatch;
  /** Apply chain state to the world inventory; returns backing per id. */
  reconcile: (
    listings: readonly ChainItemListing[],
  ) => Promise<ReadonlyMap<number, ItemListingStatus>>;
  /** Usable world-inventory units of `slug` for a wallet. */
  usable: (walletHex: string, slug: string) => Promise<number>;
  intervalMs?: number;
  nowMs?: () => number;
  log?: (line: string) => void;
}): ItemListingIndex {
  const now = input.nowMs ?? Date.now;
  const escrowHex = input.itemEscrowHex.toLowerCase();
  const collectionHex = input.collectionHex.toLowerCase();
  let state: ItemIndexSnapshot = {
    config: null,
    listings: new Map(),
    status: new Map(),
    refreshedAtMs: null,
    error: null,
  };
  /** Listings closed on chain and fully reconciled: never read again. */
  const done = new Set<number>();
  /** Fills are immutable once written: cache them per listing. */
  const fills = new Map<number, { buyerHex: string; qty: number }[]>();
  let running: Promise<void> | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  const holdingsCache = new Map<
    string,
    { atMs: number; value: Promise<MarketItemHolding[]> }
  >();

  async function refreshOnce(): Promise<void> {
    const [cfgHex] = await input.read([
      { contractHex: escrowHex, calldataHex: itemEscrowCalldata.config() },
    ]);
    if (cfgHex == null) throw new Error("item escrow config read failed");
    const config = decodeItemEscrowConfig(cfgHex);
    if (config == null) throw new Error("item escrow config unreadable");
    const ids: number[] = [];
    for (let id = 1; id <= config.lastId; id += 1) {
      if (!done.has(id)) ids.push(id);
    }
    const listingHex = await input.read(
      ids.map((id) => ({
        contractHex: escrowHex,
        calldataHex: itemEscrowCalldata.listing(id),
      })),
    );
    const read: ItemEscrowListing[] = [];
    ids.forEach((id, i) => {
      const hex = listingHex[i];
      if (hex == null) throw new Error(`item listing ${id} read failed`);
      const l = decodeItemEscrowListing(id, hex);
      if (l != null) read.push(l);
    });
    // New fills only.
    const fillCalls: ReadCall[] = [];
    const fillAt: [number, number][] = [];
    for (const l of read) {
      const have = fills.get(l.id)?.length ?? 0;
      for (let k = have; k < l.fills; k += 1) {
        fillCalls.push({
          contractHex: escrowHex,
          calldataHex: itemEscrowCalldata.fill(l.id, k),
        });
        fillAt.push([l.id, k]);
      }
    }
    const fillHex = await input.read(fillCalls);
    fillAt.forEach(([id, k], i) => {
      const hex = fillHex[i];
      const fill = hex != null ? decodeItemEscrowFill(hex) : null;
      if (fill == null) throw new Error(`item fill ${id}/${k} read failed`);
      const list = fills.get(id) ?? [];
      if (list.length === k) list.push(fill);
      fills.set(id, list);
    });
    const chain: ChainItemListing[] = read
      .filter((l) => l.collectionHex.toLowerCase() === collectionHex)
      .map((l) => ({
        id: l.id,
        sellerHex: l.sellerHex,
        itemId: l.itemId,
        listed: l.listed,
        remaining: l.remaining,
        open: l.open,
        fillCount: l.fills,
        fills: fills.get(l.id) ?? [],
      }));
    const status = await input.reconcile(chain);
    const listings = new Map<number, ItemEscrowListing>();
    for (const l of read) {
      if (l.open) listings.set(l.id, l);
      else if (status.get(l.id)?.reconciled === true) {
        done.add(l.id);
        fills.delete(l.id);
      }
    }
    state = {
      config,
      listings,
      status: new Map(status),
      refreshedAtMs: now(),
      error: null,
    };
    holdingsCache.clear();
  }

  const refresh = () => {
    running ??= refreshOnce()
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        state = { ...state, error: message };
        input.log?.(`item market index: ${message}`);
      })
      .finally(() => {
        running = null;
      });
    return running;
  };

  async function holdingsNow(wallet: string): Promise<MarketItemHolding[]> {
    const entries = Object.entries(LPIT_ITEM_IDS);
    const balances = await input
      .read(
        entries.map(([, id]) => ({
          contractHex: collectionHex,
          calldataHex: multiTokenCalldata.balanceOf(wallet, id),
        })),
      )
      .catch(() => entries.map(() => null));
    const out: MarketItemHolding[] = [];
    for (const [i, [slug, itemId]] of entries.entries()) {
      const hex = balances[i];
      const raw = hex != null ? decodeMultiTokenBalance(hex) : null;
      const chain = raw == null ? null : Number(raw);
      const usable = await input.usable(wallet, slug);
      let listed = 0;
      for (const l of state.listings.values()) {
        if (l.itemId === itemId && l.sellerHex === wallet)
          listed += l.remaining;
      }
      out.push({
        itemId,
        itemSlug: slug,
        name: itemName(itemId),
        chain,
        usable,
        tradable: Math.max(0, Math.min(chain ?? 0, usable)),
        listed,
      });
    }
    return out;
  }

  function holdings(wallet: string): Promise<MarketItemHolding[]> {
    const t = now();
    const hit = holdingsCache.get(wallet);
    if (hit != null && t - hit.atMs < 5_000) return hit.value;
    if (holdingsCache.size > 500) holdingsCache.clear();
    const value = holdingsNow(wallet);
    holdingsCache.set(wallet, { atMs: t, value });
    value.catch(() => holdingsCache.delete(wallet));
    return value;
  }

  return {
    refresh,
    snapshot: () => state,
    response: async (walletRaw) => {
      const wallet = walletRaw?.toLowerCase() ?? null;
      const listings: MarketItemListing[] = [...state.listings.values()]
        .sort((a, b) =>
          a.unitPriceWei === b.unitPriceWei
            ? a.id - b.id
            : a.unitPriceWei < b.unitPriceWei
              ? -1
              : 1,
        )
        .map((l) => {
          const st = state.status.get(l.id);
          return {
            id: l.id,
            sellerHex: l.sellerHex,
            itemId: l.itemId,
            itemSlug: lpitItemSlug(l.itemId),
            name: itemName(l.itemId),
            unitPriceWei: l.unitPriceWei.toString(),
            listed: l.listed,
            remaining: l.remaining,
            backed: st?.backed ?? 0,
            reconciled: st?.reconciled ?? false,
          };
        });
      return {
        v: MARKET_API_VERSION,
        itemEscrowHex: escrowHex,
        collectionHex,
        feeBps: state.config?.feeBps ?? null,
        feeToHex: state.config?.feeToHex ?? null,
        refreshedAtMs: state.refreshedAtMs,
        error: state.error,
        note:
          state.refreshedAtMs == null
            ? "Item escrow configured; its listings have not been read yet."
            : "LPIT items trade by quantity in the item escrow on Boing testnet: one wallet transaction to list, buy or cancel.",
        listings,
        wallet:
          wallet == null
            ? null
            : { hex: wallet, holdings: await holdings(wallet) },
      };
    },
    start: () => {
      if (timer != null) return;
      void refresh();
      timer = setInterval(() => void refresh(), input.intervalMs ?? 30_000);
      timer.unref?.();
    },
    stop: () => {
      if (timer != null) clearInterval(timer);
      timer = null;
    },
  };
}

/** The response when no item escrow is configured. */
export function disabledItemsResponse(note: string): MarketItemsResponse {
  return {
    v: MARKET_API_VERSION,
    itemEscrowHex: null,
    collectionHex: null,
    feeBps: null,
    feeToHex: null,
    refreshedAtMs: null,
    error: null,
    note,
    listings: [],
    wallet: null,
  };
}

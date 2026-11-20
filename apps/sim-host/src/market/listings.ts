/**
 * Listing index fed by contract state: every refresh reads the escrow's
 * `config`, and for each minted token the escrow `listing` and the
 * collection's `owner_of`, as read-only `boing_simulateContractCall`s sent in
 * JSON-RPC batches. Nothing is signed or submitted.
 *
 * Served at `GET /market/v1/listings` and merged into the catalog, so the
 * marketplace shows real listings and real on-chain owners.
 */
import {
  MARKET_API_VERSION,
  decodeEscrowConfig,
  decodeEscrowListing,
  decodeOwnerOf,
  escrowCalldata,
  escrowTokenId,
  referenceNftCalldata,
  type EscrowConfig,
  type MarketListing,
  type MarketListingsResponse,
} from "@boing-pets/contract";

/** One read-only contract call. */
export type ReadCall = { contractHex: string; calldataHex: string };
/** Return data per call (null when the call failed). */
export type ReadBatch = (calls: ReadCall[]) => Promise<(string | null)[]>;

export type IndexedToken = { collectionHex: string; tokenIdHex: string };

/** Map key for a token: lower-case collection and decimal token id. */
export function marketTokenKey(
  collectionHex: string,
  tokenIdHex: string,
): string {
  return `${collectionHex.toLowerCase()}:${BigInt(tokenIdHex).toString()}`;
}

/** Minted tokens (one per collection and id) from mint-link rows. */
export function mintedTokens(
  rows: readonly {
    status: string;
    collectionHex: string | null;
    tokenIdHex: string | null;
  }[],
): IndexedToken[] {
  const seen = new Map<string, IndexedToken>();
  for (const r of rows) {
    if (r.status !== "CONFIRMED" && r.status !== "SUBMITTED") continue;
    if (r.collectionHex == null || r.tokenIdHex == null) continue;
    const key = marketTokenKey(r.collectionHex, r.tokenIdHex);
    if (!seen.has(key)) {
      seen.set(key, {
        collectionHex: r.collectionHex,
        tokenIdHex: r.tokenIdHex,
      });
    }
  }
  return [...seen.values()];
}

export type ListingIndexSnapshot = {
  /** Open listings by `marketTokenKey`. */
  listings: ReadonlyMap<string, MarketListing>;
  /** On-chain holder by `marketTokenKey` (escrow included). */
  owners: ReadonlyMap<string, string>;
  config: EscrowConfig | null;
  refreshedAtMs: number | null;
  error: string | null;
};

export type ListingIndex = {
  refresh(): Promise<void>;
  snapshot(): ListingIndexSnapshot;
  response(): MarketListingsResponse;
  start(): void;
  stop(): void;
};

function fitsU64(tokenIdHex: string): boolean {
  try {
    escrowTokenId(tokenIdHex);
    return true;
  } catch {
    return false;
  }
}

export function createListingIndex(input: {
  escrowHex: string;
  read: ReadBatch;
  tokens: () => Promise<IndexedToken[]>;
  intervalMs?: number;
  nowMs?: () => number;
  log?: (line: string) => void;
}): ListingIndex {
  const now = input.nowMs ?? Date.now;
  const escrowHex = input.escrowHex.toLowerCase();
  let state: ListingIndexSnapshot = {
    listings: new Map(),
    owners: new Map(),
    config: null,
    refreshedAtMs: null,
    error: null,
  };
  let tokensByKey = new Map<string, IndexedToken>();
  let running: Promise<void> | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  async function refreshOnce(): Promise<void> {
    const tokens = (await input.tokens()).filter((t) => fitsU64(t.tokenIdHex));
    const calls: ReadCall[] = [
      { contractHex: escrowHex, calldataHex: escrowCalldata.config() },
    ];
    for (const t of tokens) {
      calls.push(
        {
          contractHex: escrowHex,
          calldataHex: escrowCalldata.listing(t.collectionHex, t.tokenIdHex),
        },
        {
          contractHex: t.collectionHex,
          calldataHex: referenceNftCalldata.ownerOf(t.tokenIdHex),
        },
      );
    }
    const results = await input.read(calls);
    if (results[0] == null) throw new Error("escrow config read failed");
    const config = decodeEscrowConfig(results[0]);
    const listings = new Map<string, MarketListing>();
    const owners = new Map<string, string>();
    const tokenHex = new Map<string, IndexedToken>();
    tokens.forEach((t, i) => {
      const key = marketTokenKey(t.collectionHex, t.tokenIdHex);
      tokenHex.set(key, t);
      const listingHex = results[1 + i * 2];
      const ownerHex = results[2 + i * 2];
      const listing =
        listingHex != null ? decodeEscrowListing(listingHex) : null;
      if (listing != null) {
        listings.set(key, {
          sellerHex: listing.sellerHex,
          priceWei: listing.priceWei.toString(),
          buyerHex: listing.buyerHex,
        });
      }
      const owner = ownerHex != null ? decodeOwnerOf(ownerHex) : null;
      if (owner != null) owners.set(key, owner);
    });
    state = { listings, owners, config, refreshedAtMs: now(), error: null };
    tokensByKey = tokenHex;
  }

  const refresh = () => {
    running ??= refreshOnce()
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        // Keep the last good view; report why it is stale.
        state = { ...state, error: message };
        input.log?.(`market listing index: ${message}`);
      })
      .finally(() => {
        running = null;
      });
    return running;
  };

  return {
    refresh,
    snapshot: () => state,
    response: () => {
      return {
        v: MARKET_API_VERSION,
        escrowHex,
        feeBps: state.config?.feeBps ?? null,
        feeToHex: state.config?.feeToHex ?? null,
        refreshedAtMs: state.refreshedAtMs,
        error: state.error,
        listings: [...state.listings].map(([key, l]) => ({
          collectionHex:
            tokensByKey.get(key)?.collectionHex ?? key.split(":")[0]!,
          tokenIdHex: tokensByKey.get(key)?.tokenIdHex ?? key.split(":")[1]!,
          ...l,
        })),
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

/** `ReadBatch` over a Boing JSON-RPC client, in batches of `chunk` calls. */
export function rpcReadBatch(
  client: {
    requestBatch(
      calls: ReadonlyArray<{ method: string; params?: unknown[] }>,
    ): Promise<{ result?: unknown; error?: unknown }[]>;
  },
  chunk = 40,
): ReadBatch {
  return async (calls) => {
    const out: (string | null)[] = [];
    for (let i = 0; i < calls.length; i += chunk) {
      const part = calls.slice(i, i + chunk);
      const res = await client.requestBatch(
        part.map((c) => ({
          method: "boing_simulateContractCall",
          params: [c.contractHex, c.calldataHex],
        })),
      );
      for (let j = 0; j < part.length; j += 1) {
        const r = res[j]?.result as
          { success?: boolean; return_data?: string } | undefined;
        out.push(r?.success === true ? (r.return_data ?? "0x") : null);
      }
    }
    return out;
  };
}

import type { MarketCatalog } from "@boing-pets/contract";
import type { WorldSnapshot } from "@boing-pets/sim";
import type { AssetMintLinkStore } from "../boing/asset-mint-link";
import type { CreatureNftLinkStore } from "../boing/nft-link";
import { buildMarketCatalog } from "./catalog";
import type { MarketConfig } from "./config";
import type { ListingIndexSnapshot } from "./listings";

/**
 * Serve the catalog from a short cache so a burst of page loads costs one
 * build. Concurrent callers share the in-flight build.
 */
export function createCatalogCache(input: {
  snapshot: () => WorldSnapshot;
  creatureLinks: CreatureNftLinkStore;
  assetLinks: AssetMintLinkStore;
  config: MarketConfig;
  /** Escrow listing index; null when no escrow is configured. */
  index?: { snapshot(): ListingIndexSnapshot } | null;
  maxAgeMs?: number;
  nowMs?: () => number;
}): () => Promise<MarketCatalog> {
  const maxAge = input.maxAgeMs ?? 2000;
  const now = input.nowMs ?? Date.now;
  let cached: { atMs: number; value: Promise<MarketCatalog> } | null = null;
  return () => {
    const t = now();
    if (cached != null && t - cached.atMs < maxAge) return cached.value;
    const value = (async () => {
      const [creatureLinks, assetLinks] = await Promise.all([
        input.creatureLinks.list(),
        input.assetLinks.list(),
      ]);
      const chain = input.index?.snapshot() ?? null;
      return buildMarketCatalog({
        snapshot: input.snapshot(),
        creatureLinks,
        assetLinks,
        config: input.config,
        nowMs: t,
        ...(chain != null
          ? {
              listings: chain.listings,
              owners: chain.owners,
              chain: {
                feeBps: chain.config?.feeBps ?? null,
                feeToHex: chain.config?.feeToHex ?? null,
                refreshedAtMs: chain.refreshedAtMs,
                error: chain.error,
              },
            }
          : {}),
      });
    })();
    cached = { atMs: t, value };
    value.catch(() => {
      cached = null;
    });
    return value;
  };
}

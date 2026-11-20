import type { MarketCatalog } from "@boing-pets/contract";
import type { WorldSnapshot } from "@boing-pets/sim";
import type { AssetMintLinkStore } from "../boing/asset-mint-link";
import type { CreatureNftLinkStore } from "../boing/nft-link";
import { buildMarketCatalog } from "./catalog";
import type { MarketConfig } from "./config";

/**
 * Serve the catalog from a short cache so a burst of page loads costs one
 * build. Concurrent callers share the in-flight build.
 */
export function createCatalogCache(input: {
  snapshot: () => WorldSnapshot;
  creatureLinks: CreatureNftLinkStore;
  assetLinks: AssetMintLinkStore;
  config: MarketConfig;
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
      return buildMarketCatalog({
        snapshot: input.snapshot(),
        creatureLinks,
        assetLinks,
        config: input.config,
        nowMs: t,
      });
    })();
    cached = { atMs: t, value };
    value.catch(() => {
      cached = null;
    });
    return value;
  };
}

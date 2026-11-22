/**
 * Optional live counts from the shared world's market catalog. Failures are
 * silent: the bestiary still works fully from the static catalog.
 */
import type { MarketCatalog } from "@boing-pets/contract";
import { catalogUrl } from "../market/catalog-source";

export type SpeciesLiveCounts = {
  living: number;
  listed: number;
};

export async function loadSpeciesLiveCounts(
  search: string,
  envMpUrl: string | undefined,
): Promise<ReadonlyMap<string, SpeciesLiveCounts> | null> {
  try {
    const response = await fetch(catalogUrl(search, envMpUrl));
    if (!response.ok) return null;
    const catalog = (await response.json()) as MarketCatalog;
    if (!catalog || !Array.isArray(catalog.assets)) return null;
    const counts = new Map<string, SpeciesLiveCounts>();
    for (const asset of catalog.assets) {
      const slug = asset.speciesSlug;
      if (!slug) continue;
      const current = counts.get(slug) ?? { living: 0, listed: 0 };
      if (asset.kind === "CREATURE" && asset.live?.alive) current.living += 1;
      if (asset.listing != null) current.listed += 1;
      counts.set(slug, current);
    }
    return counts;
  } catch {
    return null;
  }
}

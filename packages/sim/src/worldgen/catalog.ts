/**
 * Worldgen catalog: species biology, territories, and links for `createWorld`.
 *
 * Species ids, slugs, display names and biology come from
 * `@boing-pets/contract` so the kernel and the client use one catalog.
 * This file keeps the territory links used by worldgen.
 */
import {
  SPECIES,
  TERRITORY_CATALOG,
  speciesCatalogRow,
  type TerritorySlug,
} from "@boing-pets/contract";

export { SPECIES, TERRITORY_CATALOG, speciesCatalogRow };
export type {
  SpeciesBiology,
  SpeciesCatalogRow,
  TerritoryCatalogRow,
  TerritorySlug,
} from "@boing-pets/contract";

export type LinkCatalogRow = {
  from: TerritorySlug;
  to: TerritorySlug;
  travelTicks: number;
};

const UNDIRECTED_LINKS: ReadonlyArray<
  readonly [TerritorySlug, TerritorySlug, number]
> = [
  ["meadow", "thicket", 6],
  ["thicket", "ridge", 8],
  ["meadow", "glade", 5],
  ["glade", "grove", 6],
  ["grove", "thicket", 6],
  ["thicket", "fen", 7],
  ["ridge", "crags", 7],
];

/** Directed links, both directions, in the order above. */
export const LINK_CATALOG: readonly LinkCatalogRow[] = UNDIRECTED_LINKS.flatMap(
  ([a, b, travelTicks]) => [
    { from: a, to: b, travelTicks },
    { from: b, to: a, travelTicks },
  ],
);

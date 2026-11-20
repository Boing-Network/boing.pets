/**
 * Canonical species identity shared by the kernel, the host, and the client.
 *
 * One name per species everywhere: the kernel slug and display name match the
 * client skin id and label. Biology (lifespan, traits, home territory) lives in
 * `packages/sim/src/worldgen/catalog.ts`; presentation lives in
 * `apps/client/src/view/species-skins.ts`. Both key off these ids and slugs.
 *
 * Ids 1–3 were called fernfox / mossback / pebblehare before the naming pass.
 * Worlds saved with those slugs still load; ids are unchanged, so the client
 * keeps drawing them with the same skins.
 */

export type SpeciesKey = {
  id: number;
  slug: string;
  displayName: string;
};

export const SPECIES_CATALOG = [
  { id: 1, slug: "fire-fox", displayName: "Fire Fox" },
  { id: 2, slug: "moss-stag", displayName: "Moss Stag" },
  { id: 3, slug: "lantern-moth", displayName: "Lantern Moth" },
  { id: 4, slug: "glow-tortoise", displayName: "Glow Tortoise" },
  { id: 5, slug: "moon-hare", displayName: "Moon Hare" },
  { id: 6, slug: "crag-ram", displayName: "Crag Ram" },
  { id: 7, slug: "thistle-hog", displayName: "Thistle Hog" },
] as const satisfies readonly SpeciesKey[];

export type SpeciesSlug = (typeof SPECIES_CATALOG)[number]["slug"];

/** Pre-rename kernel slugs, for reading worlds created before the rename. */
export const LEGACY_SPECIES_SLUGS: Readonly<Record<string, SpeciesSlug>> = {
  fernfox: "fire-fox",
  mossback: "moss-stag",
  pebblehare: "lantern-moth",
};

export function speciesKeyForId(id: number): SpeciesKey | null {
  return SPECIES_CATALOG.find((row) => row.id === id) ?? null;
}

export function speciesKeyForSlug(slug: string): SpeciesKey | null {
  const canonical = LEGACY_SPECIES_SLUGS[slug] ?? slug;
  return SPECIES_CATALOG.find((row) => row.slug === canonical) ?? null;
}

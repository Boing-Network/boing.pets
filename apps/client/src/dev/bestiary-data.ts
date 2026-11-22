/**
 * Pure helpers for the browsable bestiary: query parsing, filtering, sorting,
 * and links. Kept free of React so unit tests can cover them without a DOM.
 */
import {
  Diet,
  SPECIES,
  TERRITORY_CATALOG,
  speciesCatalogRowBySlug,
  territoryName,
  type SpeciesCatalogRow,
  type TerritorySlug,
} from "@boing-pets/contract";
import { SPECIES_WORLD_SCALE } from "../view/creatures/materials";
import { DIET_LABEL, GAIT_LABEL, GAIT_NAME } from "../site/species-labels";

export type PoseMode = "idle" | "walk" | "graze" | "rest";

export type BestiarySort = "catalog" | "name" | "habitat" | "diet" | "lifespan";

export type BestiaryFilters = {
  query: string;
  /** Territory slug, or "" for every habitat. Matches home or ease-habitat. */
  habitat: string;
  diet: "" | Diet;
  sort: BestiarySort;
};

export const DEFAULT_BESTIARY_FILTERS: BestiaryFilters = {
  query: "",
  habitat: "",
  diet: "",
  sort: "catalog",
};

export const BESTIARY_INDEX_HREF = "/world/?bestiary";

export function bestiaryHref(slug?: string): string {
  return slug
    ? `/world/?bestiary=${encodeURIComponent(slug)}`
    : BESTIARY_INDEX_HREF;
}

export function marketHrefForSpecies(slug: string): string {
  return `/market/?species=${encodeURIComponent(slug)}`;
}

export function parseBestiarySearch(search: string): {
  slug: string;
  capture: boolean;
  pose: PoseMode;
} {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  const raw = params.get("bestiary") ?? "";
  const pose = params.get("pose");
  const mode: PoseMode =
    pose === "idle" || pose === "walk" || pose === "graze" || pose === "rest"
      ? pose
      : "walk";
  return {
    slug: raw,
    capture: params.has("capture"),
    pose: mode,
  };
}

export function worldScaleForSpecies(slug: string): number {
  return SPECIES_WORLD_SCALE[slug] ?? 3.4;
}

export const BESTIARY_SPECIES: readonly SpeciesCatalogRow[] = SPECIES;

export const BESTIARY_TERRITORIES = TERRITORY_CATALOG;

export const DIETS: readonly Diet[] = [
  Diet.HERBIVORE,
  Diet.OMNIVORE,
  Diet.INSECTIVORE,
  Diet.CARNIVORE,
];

export {
  DIET_LABEL,
  GAIT_LABEL,
  GAIT_NAME,
  territoryName,
  speciesCatalogRowBySlug,
};

export function filterBestiary(
  rows: readonly SpeciesCatalogRow[],
  filters: BestiaryFilters,
): SpeciesCatalogRow[] {
  const q = filters.query.trim().toLowerCase();
  const habitat = filters.habitat;
  const out = rows.filter((row) => {
    if (filters.diet && row.diet !== filters.diet) return false;
    if (
      habitat &&
      row.home !== habitat &&
      !row.habitat.includes(habitat as TerritorySlug)
    ) {
      return false;
    }
    if (q) {
      const hay = [
        row.displayName,
        row.slug,
        DIET_LABEL[row.diet],
        GAIT_NAME[row.gait],
        GAIT_LABEL[row.gait],
        territoryName(row.home),
        ...row.habitat.map((slug) => territoryName(slug)),
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const sorted = [...out];
  sorted.sort((a, b) => {
    switch (filters.sort) {
      case "name":
        return a.displayName.localeCompare(b.displayName);
      case "habitat":
        return (
          territoryName(a.home).localeCompare(territoryName(b.home)) ||
          a.id - b.id
        );
      case "diet":
        return (
          DIET_LABEL[a.diet].localeCompare(DIET_LABEL[b.diet]) || a.id - b.id
        );
      case "lifespan":
        return b.baseLifespanDays - a.baseLifespanDays || a.id - b.id;
      case "catalog":
      default:
        return a.id - b.id;
    }
  });
  return sorted;
}

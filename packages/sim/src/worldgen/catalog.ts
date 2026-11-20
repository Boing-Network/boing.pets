/**
 * Worldgen catalog: species biology, territories, and links for `createWorld`.
 *
 * Species ids, slugs, and display names come from `@boing-pets/contract`
 * (`SPECIES_CATALOG`) so the kernel and the client use one name per species.
 * Ids 1–3 and territories 1–3 keep their original ids, numbers, and founder
 * order, so the first 12 founders of every seed are unchanged by the
 * expansion. New species and territories append after them.
 */
import { SPECIES_CATALOG, type SpeciesSlug } from "@boing-pets/contract";

export type SpeciesBiology = {
  slug: SpeciesSlug;
  home: TerritorySlug;
  maturityDays: number;
  baseLifespanDays: number;
  gestationDays: number;
  juvenileDays: number;
  baseCuriosity: number;
  baseAggression: number;
  baseLoyalty: number;
  baseSociability: number;
  baseBravery: number;
  baseRiskTaking: number;
  colorHex: string;
};

export type SpeciesCatalogRow = SpeciesBiology & {
  id: number;
  displayName: string;
};

const BIOLOGY: readonly SpeciesBiology[] = [
  {
    slug: "fire-fox",
    home: "meadow",
    maturityDays: 90,
    baseLifespanDays: 900,
    gestationDays: 18,
    juvenileDays: 16,
    baseCuriosity: 700,
    baseAggression: 350,
    baseLoyalty: 500,
    baseSociability: 600,
    baseBravery: 550,
    baseRiskTaking: 650,
    colorHex: "#E07A3D",
  },
  {
    slug: "moss-stag",
    home: "thicket",
    maturityDays: 140,
    baseLifespanDays: 1400,
    gestationDays: 30,
    juvenileDays: 28,
    baseCuriosity: 300,
    baseAggression: 250,
    baseLoyalty: 750,
    baseSociability: 400,
    baseBravery: 400,
    baseRiskTaking: 200,
    colorHex: "#6B8F71",
  },
  {
    slug: "lantern-moth",
    home: "ridge",
    maturityDays: 70,
    baseLifespanDays: 700,
    gestationDays: 14,
    juvenileDays: 12,
    baseCuriosity: 550,
    baseAggression: 200,
    baseLoyalty: 400,
    baseSociability: 500,
    baseBravery: 300,
    baseRiskTaking: 500,
    colorHex: "#C2B280",
  },
  {
    // Slow, long-lived fen grazer. Calm and steady; rarely contests food.
    slug: "glow-tortoise",
    home: "fen",
    maturityDays: 160,
    baseLifespanDays: 1800,
    gestationDays: 36,
    juvenileDays: 32,
    baseCuriosity: 250,
    baseAggression: 150,
    baseLoyalty: 650,
    baseSociability: 350,
    baseBravery: 500,
    baseRiskTaking: 150,
    colorHex: "#7A8F5A",
  },
  {
    // Quick-breeding glade forager. Social and curious, easily spooked.
    slug: "moon-hare",
    home: "glade",
    maturityDays: 60,
    baseLifespanDays: 600,
    gestationDays: 12,
    juvenileDays: 10,
    baseCuriosity: 650,
    baseAggression: 150,
    baseLoyalty: 350,
    baseSociability: 700,
    baseBravery: 250,
    baseRiskTaking: 450,
    colorHex: "#C9D2E6",
  },
  {
    // Hardy high-crag grazer. Brave and quick to contest scarce food.
    slug: "crag-ram",
    home: "crags",
    maturityDays: 120,
    baseLifespanDays: 1100,
    gestationDays: 24,
    juvenileDays: 20,
    baseCuriosity: 400,
    baseAggression: 600,
    baseLoyalty: 550,
    baseSociability: 450,
    baseBravery: 750,
    baseRiskTaking: 600,
    colorHex: "#8A7F74",
  },
  {
    // Grove rooter. Loyal to kin and prickly with strangers.
    slug: "thistle-hog",
    home: "grove",
    maturityDays: 80,
    baseLifespanDays: 800,
    gestationDays: 16,
    juvenileDays: 14,
    baseCuriosity: 500,
    baseAggression: 450,
    baseLoyalty: 600,
    baseSociability: 300,
    baseBravery: 600,
    baseRiskTaking: 350,
    colorHex: "#6E5A48",
  },
];

/** Every species, ascending id. Founders are generated in this order. */
export const SPECIES: readonly SpeciesCatalogRow[] = SPECIES_CATALOG.map(
  (key) => {
    const biology = BIOLOGY.find((row) => row.slug === key.slug);
    if (!biology) throw new Error(`species biology ${key.slug}`);
    return { ...biology, id: key.id, displayName: key.displayName };
  },
);

export type TerritorySlug =
  "meadow" | "thicket" | "ridge" | "glade" | "fen" | "grove" | "crags";

export type TerritoryCatalogRow = {
  slug: TerritorySlug;
  name: string;
  foodAbundance: number;
  danger: number;
  capacity: number;
};

/** Ids are assigned in this order: meadow 1 … crags 7. */
export const TERRITORY_CATALOG: readonly TerritoryCatalogRow[] = [
  {
    slug: "meadow",
    name: "Meadow",
    foodAbundance: 700,
    danger: 200,
    capacity: 40,
  },
  {
    slug: "thicket",
    name: "Thicket",
    foodAbundance: 500,
    danger: 450,
    capacity: 30,
  },
  {
    slug: "ridge",
    name: "Ridge",
    foodAbundance: 350,
    danger: 700,
    capacity: 20,
  },
  {
    slug: "glade",
    name: "Moonlit Glade",
    foodAbundance: 650,
    danger: 250,
    capacity: 35,
  },
  {
    slug: "fen",
    name: "Glowfen",
    foodAbundance: 600,
    danger: 350,
    capacity: 30,
  },
  {
    slug: "grove",
    name: "Elder Grove",
    foodAbundance: 550,
    danger: 400,
    capacity: 28,
  },
  {
    slug: "crags",
    name: "High Crags",
    foodAbundance: 300,
    danger: 600,
    capacity: 18,
  },
];

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

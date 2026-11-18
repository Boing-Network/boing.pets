/**
 * Presentation biomes. A territory keeps its kernel identity (id, slug, name);
 * the biome only decides how its region of the landscape is drawn.
 */

export type BiomeId = "meadow" | "thicket" | "ridge";
export type WaterKind = "pond" | "swamp" | "tarn";

export type Biome = {
  id: BiomeId;
  /** Typical ground height of the region above the sea, in world units. */
  elevation: number;
  /** Rolling relief amplitude. */
  relief: number;
  /** Craggy relief amplitude. */
  crag: number;
  water: WaterKind;
  /** Ground colors, linear-ish night palette. */
  ground: string;
  groundAlt: string;
  /** Accent used for region labels and glow flora. */
  glow: string;
  label: string;
};

export const BIOMES: Record<BiomeId, Biome> = {
  meadow: {
    id: "meadow",
    elevation: 2.4,
    relief: 1.1,
    crag: 0,
    water: "pond",
    ground: "#2f6b46",
    groundAlt: "#4a8a4e",
    glow: "#ffb46a",
    label: "#ffe2b8",
  },
  thicket: {
    id: "thicket",
    elevation: 4.6,
    relief: 1.7,
    crag: 0.3,
    water: "swamp",
    ground: "#1d4a40",
    groundAlt: "#2a5f4a",
    glow: "#4fe6c4",
    label: "#bff5e6",
  },
  ridge: {
    id: "ridge",
    elevation: 13,
    relief: 2.4,
    crag: 4.2,
    water: "tarn",
    ground: "#4b4a63",
    groundAlt: "#6a6680",
    glow: "#8fd0ff",
    label: "#d9e6ff",
  },
};

/** Land outside every territory: dusky rolling wilds. */
export const WILD = {
  elevation: 3.2,
  relief: 2.6,
  crag: 0.8,
  ground: "#22483f",
  groundAlt: "#2d5a44",
};

export type BiomeSource = {
  slug: string;
  foodAbundance: number;
  danger: number;
};

/**
 * Known slugs keep their look. Anything else worldgen yields later is placed
 * by its base stats: dangerous ground reads as ridge, rich ground as meadow.
 */
export function biomeForTerritory(source: BiomeSource): Biome {
  const known = (BIOMES as Record<string, Biome | undefined>)[source.slug];
  if (known) return known;
  if (source.danger >= 600) return BIOMES.ridge;
  if (source.foodAbundance >= 600) return BIOMES.meadow;
  return BIOMES.thicket;
}

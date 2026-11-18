/**
 * View-only species → presentation skin map.
 * Genes and personality stay data; skins do not affect the sim kernel.
 *
 * Art direction (docs/art-direction.md):
 * - Fire-leaning → fire fox
 * - Nature / earth-leaning → moss stag
 * - Air / spirit / social-leaning → lantern moth
 */

export type CreatureSkinId = "fire-fox" | "moss-stag" | "lantern-moth";

export type CreatureSkinPalette = {
  id: CreatureSkinId;
  label: string;
  /** Primary silhouette / fur color. */
  primary: string;
  secondary: string;
  accent: string;
  emissive: string;
  emissiveIntensity: number;
};

/** Kernel species ids from the v1 catalog (fernfox, mossback, pebblehare). */
const SPECIES_SKIN_BY_ID: Record<number, CreatureSkinId> = {
  1: "fire-fox", // fernfox — warm / fire-leaning
  2: "moss-stag", // mossback — nature / earth
  3: "lantern-moth", // pebblehare — air / spirit / social presentation
};

const SKIN_PALETTES: Record<CreatureSkinId, CreatureSkinPalette> = {
  "fire-fox": {
    id: "fire-fox",
    label: "Fire fox",
    primary: "#D47238",
    secondary: "#F0E4D0",
    accent: "#2A2420",
    emissive: "#E89840",
    // Soft ember — readable at night, not toy neon.
    emissiveIntensity: 0.72,
  },
  "moss-stag": {
    id: "moss-stag",
    label: "Moss stag",
    primary: "#5A8260",
    secondary: "#E6E0D2",
    accent: "#6B4E2E",
    emissive: "#6BC8D8",
    // Cyan lichen biolights, atmospheric.
    emissiveIntensity: 0.55,
  },
  "lantern-moth": {
    id: "lantern-moth",
    label: "Lantern moth",
    primary: "#F2F0F6",
    secondary: "#B9A6D9",
    accent: "#5FC4B8",
    emissive: "#E8C060",
    // Warm lantern core through soft down.
    emissiveIntensity: 0.85,
  },
};

export function skinIdForSpecies(speciesId: number): CreatureSkinId {
  return SPECIES_SKIN_BY_ID[speciesId] ?? "moss-stag";
}

export function skinForSpecies(speciesId: number): CreatureSkinPalette {
  return SKIN_PALETTES[skinIdForSpecies(speciesId)];
}

export function colorForSpecies(speciesId: number): string {
  return skinForSpecies(speciesId).primary;
}

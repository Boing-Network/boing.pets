/**
 * View-only species → presentation skin map.
 * Genes and personality stay data; skins do not affect the sim kernel.
 *
 * Skin ids are the canonical species slugs from `@boing-pets/contract`
 * (`SPECIES_CATALOG`), so the kernel, the HUD, and the renderer all use one
 * name per species (see docs/DESIGN.md, "Species naming").
 *
 * Art direction: night landscape, soft fur and down, atmospheric lore glows
 * (not toy neon). Each species carries one warm or cool glow accent.
 */
import { SPECIES_CATALOG, type SpeciesSlug } from "@boing-pets/contract";
import type { Locomotion } from "./motion/behavior";

export type CreatureSkinId = SpeciesSlug;

export type CreatureSkinPalette = {
  id: CreatureSkinId;
  label: string;
  /** Primary silhouette / fur color. */
  primary: string;
  secondary: string;
  accent: string;
  emissive: string;
  emissiveIntensity: number;
  locomotion: Locomotion;
};

const FALLBACK_SKIN: CreatureSkinId = "moss-stag";

const SPECIES_SKIN_BY_ID: ReadonlyMap<number, CreatureSkinId> = new Map(
  SPECIES_CATALOG.map((row) => [row.id, row.slug]),
);

const LABEL_BY_SKIN: ReadonlyMap<CreatureSkinId, string> = new Map(
  SPECIES_CATALOG.map((row) => [row.slug, row.displayName]),
);

type PaletteBody = Omit<CreatureSkinPalette, "id" | "label">;

const SKIN_PALETTES: Record<CreatureSkinId, PaletteBody> = {
  "fire-fox": {
    primary: "#D47238",
    secondary: "#F0E4D0",
    accent: "#2A2420",
    emissive: "#E89840",
    // Soft ember — readable at night, not toy neon.
    emissiveIntensity: 0.72,
    locomotion: "trot",
  },
  "moss-stag": {
    primary: "#5A8260",
    secondary: "#E6E0D2",
    accent: "#6B4E2E",
    emissive: "#6BC8D8",
    // Cyan lichen biolights, atmospheric.
    emissiveIntensity: 0.55,
    locomotion: "walk",
  },
  "lantern-moth": {
    primary: "#F2F0F6",
    secondary: "#B9A6D9",
    accent: "#5FC4B8",
    emissive: "#E8C060",
    // Warm lantern core through soft down.
    emissiveIntensity: 0.85,
    locomotion: "fly",
  },
  "glow-tortoise": {
    primary: "#5E6B48",
    secondary: "#C9B98E",
    accent: "#3B3328",
    emissive: "#7FE0B0",
    // Mint fen-moss runes along the shell seams.
    emissiveIntensity: 0.6,
    locomotion: "walk",
  },
  "moon-hare": {
    primary: "#C9D2E6",
    secondary: "#F4F1EA",
    accent: "#4A4E63",
    emissive: "#B8D4FF",
    // Pale moonlight caught in the ear tips.
    emissiveIntensity: 0.62,
    locomotion: "trot",
  },
  "crag-ram": {
    primary: "#8A7F74",
    secondary: "#E2DACB",
    accent: "#3A332E",
    emissive: "#9FC4FF",
    // Cold quartz glints in the horn ridges.
    emissiveIntensity: 0.5,
    locomotion: "walk",
  },
  "thistle-hog": {
    primary: "#6E5A48",
    secondary: "#D8C3A5",
    accent: "#2B211B",
    emissive: "#E07AD0",
    // Thistle-bloom quill tips, dusky violet.
    emissiveIntensity: 0.58,
    locomotion: "trot",
  },
};

export function skinIdForSpecies(speciesId: number): CreatureSkinId {
  return SPECIES_SKIN_BY_ID.get(speciesId) ?? FALLBACK_SKIN;
}

export function skinForSkinId(skinId: CreatureSkinId): CreatureSkinPalette {
  return {
    id: skinId,
    label: LABEL_BY_SKIN.get(skinId) ?? skinId,
    ...SKIN_PALETTES[skinId],
  };
}

export function skinForSpecies(speciesId: number): CreatureSkinPalette {
  return skinForSkinId(skinIdForSpecies(speciesId));
}

export function colorForSpecies(speciesId: number): string {
  return skinForSpecies(speciesId).primary;
}

/** Display name for HUD text; unknown ids read as "Unknown species". */
export function speciesLabel(speciesId: number): string {
  const skin = SPECIES_SKIN_BY_ID.get(speciesId);
  return skin ? (LABEL_BY_SKIN.get(skin) ?? skin) : "Unknown species";
}

export const ALL_SKIN_IDS: readonly CreatureSkinId[] = SPECIES_CATALOG.map(
  (row) => row.slug,
);

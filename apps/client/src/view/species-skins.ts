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
  "barrow-badger": {
    primary: "#5E5A55",
    secondary: "#D9D4CA",
    accent: "#1E1C1A",
    emissive: "#C9B27A",
    // Lamp-amber cheek stripe, faint.
    emissiveIntensity: 0.4,
    locomotion: "walk",
  },
  "field-nightjar": {
    primary: "#6B5B48",
    secondary: "#B8A487",
    accent: "#2E261E",
    emissive: "#E8D49A",
    // Pale wing-bar flash.
    emissiveIntensity: 0.38,
    locomotion: "fly",
  },
  "shade-lynx": {
    primary: "#6F6A60",
    secondary: "#C8C0B0",
    accent: "#24211D",
    emissive: "#9FD0C8",
    // Ear-tuft glints, cold teal.
    emissiveIntensity: 0.4,
    locomotion: "walk",
  },
  "dusk-raccoon": {
    primary: "#5D5852",
    secondary: "#BDB6AA",
    accent: "#1F1D1B",
    emissive: "#B7A5E0",
    // Lavender mask-rim shimmer.
    emissiveIntensity: 0.42,
    locomotion: "walk",
  },
  "slate-marmot": {
    primary: "#7A6B58",
    secondary: "#C2B095",
    accent: "#3A2F25",
    emissive: "#E0B070",
    // Warm amber whisker-pads.
    emissiveIntensity: 0.36,
    locomotion: "trot",
  },
  "gloam-bat": {
    primary: "#3E3833",
    secondary: "#6E6357",
    accent: "#1A1715",
    emissive: "#8FB8E8",
    // Blue membrane veins.
    emissiveIntensity: 0.42,
    locomotion: "fly",
  },
  "silver-deer": {
    primary: "#8E8A80",
    secondary: "#E2DDD2",
    accent: "#3C352D",
    emissive: "#C6D8F2",
    // Moon-silver flank dapples.
    emissiveIntensity: 0.42,
    locomotion: "walk",
  },
  "dew-shrew": {
    primary: "#5A4E44",
    secondary: "#A89C8C",
    accent: "#231E1A",
    emissive: "#9EE0C8",
    // Dewdrop mint on the snout.
    emissiveIntensity: 0.4,
    locomotion: "trot",
  },
  "reed-heron": {
    primary: "#7D8790",
    secondary: "#D7DADB",
    accent: "#2C3238",
    emissive: "#A8D8F0",
    // Pale crest plume glow.
    emissiveIntensity: 0.38,
    locomotion: "walk",
  },
  "ember-newt": {
    primary: "#4A3A30",
    secondary: "#C27A3A",
    accent: "#1E1714",
    emissive: "#F09050",
    // Ember-orange belly spots.
    emissiveIntensity: 0.62,
    locomotion: "walk",
  },
  "hollow-squirrel": {
    primary: "#7A5C44",
    secondary: "#D0BDA2",
    accent: "#2E2219",
    emissive: "#E0A860",
    // Tail-tip amber fleck.
    emissiveIntensity: 0.38,
    locomotion: "trot",
  },
  "ash-wolf": {
    primary: "#6A665F",
    secondary: "#C9C3B8",
    accent: "#26231F",
    emissive: "#D8C08A",
    // Ash-gold eyeshine.
    emissiveIntensity: 0.36,
    locomotion: "trot",
  },
  "stone-pika": {
    primary: "#857A6C",
    secondary: "#CFC3B0",
    accent: "#3A332B",
    emissive: "#BFD8FF",
    // Cold quartz ear rims.
    emissiveIntensity: 0.34,
    locomotion: "trot",
  },
  "crag-owl": {
    primary: "#6E6152",
    secondary: "#CDBFA8",
    accent: "#2A231C",
    emissive: "#F0C060",
    // Amber eyes and facial-disc rim.
    emissiveIntensity: 0.5,
    locomotion: "fly",
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

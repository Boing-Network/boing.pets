/**
 * Shared presentation materials for living creatures.
 * Soft fur/feather reads, atmospheric lore glows — not toy neon.
 */
import type { CreatureSkinPalette } from "../species-skins";

export type FurTone = {
  color: string;
  roughness: number;
  metalness?: number;
};

/** Dense fur: high roughness, no metal, slight warm variation via caller. */
export function furMaterial(
  color: string,
  roughness = 0.92,
): {
  color: string;
  roughness: number;
  metalness: number;
} {
  return { color, roughness, metalness: 0 };
}

/** Soft down / feather suggestion (moth body). */
export function downMaterial(color: string): {
  color: string;
  roughness: number;
  metalness: number;
} {
  return { color, roughness: 0.96, metalness: 0 };
}

/** Wood / antler / hoof — dryer, slightly harder. */
export function hardMaterial(
  color: string,
  roughness = 0.78,
): {
  color: string;
  roughness: number;
  metalness: number;
} {
  return { color, roughness, metalness: 0.04 };
}

/** Lore glow: soft emissive fill, intensity dialed down vs first pass. */
export function loreGlow(
  palette: CreatureSkinPalette,
  boost = 1,
): {
  color: string;
  emissive: string;
  emissiveIntensity: number;
  roughness: number;
  metalness: number;
} {
  return {
    color: palette.emissive,
    emissive: palette.emissive,
    emissiveIntensity: palette.emissiveIntensity * boost,
    roughness: 0.45,
    metalness: 0.05,
  };
}

/** Iridescent wing membrane: translucent, low emissive sheen. */
export function wingMembrane(accent: string): {
  color: string;
  emissive: string;
  emissiveIntensity: number;
  transparent: true;
  opacity: number;
  roughness: number;
  metalness: number;
} {
  return {
    color: accent,
    emissive: accent,
    emissiveIntensity: 0.18,
    transparent: true,
    opacity: 0.62,
    roughness: 0.35,
    metalness: 0.12,
  };
}

/** World-space scale so creatures sit under canopy height, not toy tokens. */
export const SPECIES_WORLD_SCALE: Record<string, number> = {
  "fire-fox": 2.55,
  "moss-stag": 3.25,
  "lantern-moth": 2.15,
  "glow-tortoise": 2.9,
  "moon-hare": 2.45,
  "crag-ram": 3.0,
  "thistle-hog": 2.7,
};

export function worldScaleForSkin(skinId: string, selected: boolean): number {
  const base = SPECIES_WORLD_SCALE[skinId] ?? 3.4;
  return selected ? base * 1.06 : base;
}

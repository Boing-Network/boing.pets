/**
 * Species biology the kernel reads every tick: need-drift offsets, diet-based
 * forage odds and relief, and habitat preference. Pure integer math, no RNG.
 *
 * The profile is keyed by species id from the worldgen catalog, so worlds
 * saved before a field existed pick up the current biology on load. Ids this
 * build does not know fall back to `NEUTRAL_PROFILE` (the pre-bestiary rules).
 */
import { Diet } from "@boing-pets/contract";
import { speciesCatalogRow, type TerritorySlug } from "../worldgen/catalog";
import type { SpeciesRow } from "../types";

export type BiologyProfile = {
  diet: Diet;
  needs: { hunger: number; thirst: number; fatigue: number };
  forageSkill: number;
  /** Home first, then the other territories the species is at ease in. */
  habitat: readonly string[];
};

export const NEUTRAL_PROFILE: BiologyProfile = {
  diet: Diet.HERBIVORE,
  needs: { hunger: 0, thirst: 0, fatigue: 0 },
  forageSkill: 0,
  habitat: [],
};

const cache = new Map<number, BiologyProfile>();

export function biologyFor(speciesId: number): BiologyProfile {
  const hit = cache.get(speciesId);
  if (hit) return hit;
  const row = speciesCatalogRow(speciesId);
  const profile: BiologyProfile = row
    ? {
        diet: row.diet,
        needs: row.needs,
        forageSkill: row.forageSkill,
        habitat: [row.home, ...row.habitat] as readonly TerritorySlug[],
      }
    : NEUTRAL_PROFILE;
  cache.set(speciesId, profile);
  return profile;
}

/** Diet as stored on the species row wins; the catalog fills unknown rows. */
export function dietOf(
  species: SpeciesRow | undefined,
  speciesId: number,
): Diet {
  return species?.diet ?? biologyFor(speciesId).diet;
}

/**
 * Forage chance base (per mille) from territory food for a diet.
 * Herbivores live on the territory's plants; insect and small-prey eaters
 * depend on it less, so lean territories still feed them.
 */
export function dietFoodBase(diet: Diet, food: number): number {
  switch (diet) {
    case Diet.HERBIVORE:
      return food;
    case Diet.OMNIVORE:
      return Math.floor((food * 3) / 4) + 175;
    case Diet.INSECTIVORE:
      return Math.floor(food / 2) + 300;
    case Diet.CARNIVORE:
      return Math.floor(food / 2) + 200;
    default: {
      const never: never = diet;
      throw new Error(`diet ${String(never)}`);
    }
  }
}

/** Extra hunger relief on success / failure: a kill feeds more, misses cost. */
export function dietReliefBonus(diet: Diet, success: boolean): number {
  if (diet !== Diet.CARNIVORE) return 0;
  return success ? 150 : -30;
}

export function inHabitat(profile: BiologyProfile, slug: string): boolean {
  return profile.habitat.length === 0 || profile.habitat.includes(slug);
}

/**
 * Danger as the creature feels it: half inside its own habitat (a crag ram
 * knows its cliffs), full elsewhere. Unknown species feel the full danger.
 */
export function perceivedDanger(
  profile: BiologyProfile,
  territory: { slug: string; danger: number },
): number {
  if (profile.habitat.length > 0 && profile.habitat.includes(territory.slug)) {
    return Math.floor(territory.danger / 2);
  }
  return territory.danger;
}

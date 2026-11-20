/**
 * "Introduce species" world migration.
 *
 * Brings a saved world up to this build's species catalog without touching
 * anything it already has:
 *   - every catalog species id the world lacks gets its species row, its
 *     compatibility rows (self 1000, every other species 0), and
 *     `INTRODUCED_FOUNDERS_PER_SPECIES` founders (one female, one male) in its
 *     home territory, as young adults, at the world's current `lastTick`;
 *   - catalog species the world already has only get their `diet` refreshed
 *     when the catalog changed it (no other column is rewritten).
 *
 * Pure and deterministic: ids come from the world's id cursors, randomness is
 * keyed by (seed, lastTick, creatureId). Idempotent: a second run on the
 * result finds nothing to do and returns empty lists. Existing creatures,
 * lineages, relationships, memories and history are never modified.
 */
import type {
  CompatibilityRow,
  SpeciesRow,
  WorldEvent,
  WorldSnapshot,
} from "../types";
import type { CreatureRow, DiscoveryRow, LineageRow } from "../types";
import { SPECIES, type SpeciesCatalogRow } from "./catalog";
import { spawnFounders, type FounderIdKey } from "./founders";

export const INTRODUCED_FOUNDERS_PER_SPECIES = 2;

export type IntroduceSpeciesResult = {
  /** New species rows (insert). */
  addedSpecies: SpeciesRow[];
  /** Existing species rows whose diet changed (update). */
  updatedSpecies: SpeciesRow[];
  /** New compatibility rows (insert). */
  addedCompatibility: CompatibilityRow[];
  creatures: CreatureRow[];
  lineages: LineageRow[];
  discoveries: DiscoveryRow[];
  events: WorldEvent[];
  /** Catalog species skipped because the world has no such home territory. */
  skipped: string[];
};

function speciesRowFor(worldId: number, row: SpeciesCatalogRow): SpeciesRow {
  return {
    id: row.id,
    worldId,
    slug: row.slug,
    displayName: row.displayName,
    diet: row.diet,
    maturityDays: row.maturityDays,
    baseLifespanDays: row.baseLifespanDays,
    gestationDays: row.gestationDays,
    juvenileDays: row.juvenileDays,
    baseCuriosity: row.baseCuriosity,
    baseAggression: row.baseAggression,
    baseLoyalty: row.baseLoyalty,
    baseSociability: row.baseSociability,
    baseBravery: row.baseBravery,
    baseRiskTaking: row.baseRiskTaking,
    colorHex: row.colorHex,
  };
}

function compatibilityCompare(
  a: CompatibilityRow,
  b: CompatibilityRow,
): number {
  if (a.speciesLowId !== b.speciesLowId) return a.speciesLowId - b.speciesLowId;
  return a.speciesHighId - b.speciesHighId;
}

/** Mutates `snapshot` in place and returns exactly what it added or changed. */
export function introduceSpecies(
  snapshot: WorldSnapshot,
): IntroduceSpeciesResult {
  const result: IntroduceSpeciesResult = {
    addedSpecies: [],
    updatedSpecies: [],
    addedCompatibility: [],
    creatures: [],
    lineages: [],
    discoveries: [],
    events: [],
    skipped: [],
  };
  const world = snapshot.world;
  const tick = world.lastTick;
  const byId = new Map(snapshot.species.map((row) => [row.id, row]));
  const territoryBySlug = new Map(
    snapshot.territories.map((row) => [row.slug, row]),
  );

  for (const catalog of SPECIES) {
    const existing = byId.get(catalog.id);
    if (existing && existing.diet !== catalog.diet) {
      existing.diet = catalog.diet;
      result.updatedSpecies.push(existing);
    }
  }

  const missing = SPECIES.filter((row) => !byId.has(row.id)).sort(
    (a, b) => a.id - b.id,
  );
  if (missing.length === 0) return result;

  const take = (key: FounderIdKey): number => {
    switch (key) {
      case "creature":
        return world.nextCreatureId++;
      case "lineage":
        return world.nextLineageId++;
      case "event":
        return world.nextEventId++;
      default: {
        const never: never = key;
        throw new Error(`id ${String(never)}`);
      }
    }
  };
  const usedNames = new Set(snapshot.creatures.map((row) => row.name));

  for (const catalog of missing) {
    const home = territoryBySlug.get(catalog.home);
    if (!home) {
      result.skipped.push(catalog.slug);
      continue;
    }
    const species = speciesRowFor(world.id, catalog);
    const others = [...snapshot.species];
    snapshot.species.push(species);
    byId.set(species.id, species);
    result.addedSpecies.push(species);
    for (const other of [...others, species]) {
      const low = Math.min(other.id, species.id);
      const high = Math.max(other.id, species.id);
      const row: CompatibilityRow = {
        worldId: world.id,
        speciesLowId: low,
        speciesHighId: high,
        fertility: low === high ? 1000 : 0,
      };
      snapshot.compatibility.push(row);
      result.addedCompatibility.push(row);
    }

    const spawned = spawnFounders({
      seed: world.seed,
      tick,
      worldId: world.id,
      catalog,
      home,
      count: INTRODUCED_FOUNDERS_PER_SPECIES,
      rules: snapshot.ruleset,
      usedNames,
      take,
    });
    snapshot.creatures.push(...spawned.creatures);
    snapshot.lineages.push(...spawned.lineages);
    snapshot.discoveries.push(...spawned.discoveries);
    result.creatures.push(...spawned.creatures);
    result.lineages.push(...spawned.lineages);
    result.discoveries.push(...spawned.discoveries);
    result.events.push(...spawned.events);
  }

  snapshot.species.sort((a, b) => a.id - b.id);
  snapshot.compatibility.sort(compatibilityCompare);
  return result;
}

/** True when `introduceSpecies` would change nothing. */
export function speciesUpToDate(snapshot: WorldSnapshot): boolean {
  const byId = new Map(snapshot.species.map((row) => [row.id, row]));
  return SPECIES.every((row) => {
    const existing = byId.get(row.id);
    if (!existing) {
      return !snapshot.territories.some((t) => t.slug === row.home);
    }
    return existing.diet === row.diet;
  });
}

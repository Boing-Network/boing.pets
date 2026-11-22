/**
 * Raise stored territory capacities to this build's catalog, on boot,
 * alongside `introduceSpecies`.
 *
 * Guarded and idempotent:
 *   - only a standard seven-territory world (every catalog slug present)
 *     is eligible, so scale-rehearsal worlds (three territories at 2000)
 *     are left alone;
 *   - a territory is updated only when its stored capacity is *below*
 *     the catalog value — never lowered, and food/danger/name/links are
 *     never touched;
 *   - a second run on an already-upgraded world finds nothing to do.
 *
 * `TERRITORY_CAPACITY_VERSION` is the catalog generation this upgrade
 * targets (build 3: bestiary batch 3, sum 420). There is no extra DB
 * column: "already at catalog capacity" is the version flag.
 */
import type { TerritoryRow, WorldSnapshot } from "../types";
import { TERRITORY_CATALOG } from "./catalog";

/** Build 3: bestiary batch 3 capacities (sum 420). */
export const TERRITORY_CAPACITY_VERSION = 3;

export type TerritoryCapacityChange = {
  slug: string;
  from: number;
  to: number;
};

export type UpgradeTerritoryCapacitiesResult = {
  version: number;
  updated: TerritoryRow[];
  changes: TerritoryCapacityChange[];
};

function isStandardMap(snapshot: WorldSnapshot): boolean {
  const slugs = new Set(snapshot.territories.map((row) => row.slug));
  return TERRITORY_CATALOG.every((row) => slugs.has(row.slug));
}

/** True when this world needs no capacity write (up to date or ineligible). */
export function territoryCapacitiesUpToDate(snapshot: WorldSnapshot): boolean {
  if (!isStandardMap(snapshot)) return true;
  const bySlug = new Map(snapshot.territories.map((row) => [row.slug, row]));
  return TERRITORY_CATALOG.every((row) => {
    const stored = bySlug.get(row.slug);
    return stored != null && stored.capacity >= row.capacity;
  });
}

/**
 * Mutates `snapshot` in place and returns the territories whose capacity
 * rose. Existing creatures, lineages and history are never touched.
 */
export function upgradeTerritoryCapacities(
  snapshot: WorldSnapshot,
): UpgradeTerritoryCapacitiesResult {
  const result: UpgradeTerritoryCapacitiesResult = {
    version: TERRITORY_CAPACITY_VERSION,
    updated: [],
    changes: [],
  };
  if (!isStandardMap(snapshot)) return result;
  const targetBySlug = new Map<string, number>(
    TERRITORY_CATALOG.map((row) => [row.slug, row.capacity]),
  );
  for (const territory of snapshot.territories) {
    const target = targetBySlug.get(territory.slug);
    if (target == null || territory.capacity >= target) continue;
    result.changes.push({
      slug: territory.slug,
      from: territory.capacity,
      to: target,
    });
    territory.capacity = target;
    result.updated.push(territory);
  }
  return result;
}

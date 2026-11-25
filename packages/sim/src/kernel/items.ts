/**
 * M22 items in the kernel. The kernel never stores inventory: it only sees
 * GATHER_RESOURCE (a HARVEST modifier that draws food until it regrows) and
 * USE_ITEM (an existing-style territory modifier or a lineage favor bump).
 * Item numbers are the code catalog in `@boing-pets/contract` (items.ts), not
 * the frozen ruleset, so live worlds need no ruleset migration.
 */
import {
  COMFORT_MAX_PER_TICK,
  EventKind,
  EventTemplate,
  GATHER_RULES,
  InfluenceKind,
  ItemSlug as ItemSlugs,
  ModifierKind,
  itemDef,
  resourceForTerritory,
  seasonAt,
  stockCapFor,
  type GatherResourcePayload,
  type ItemSlug,
} from "@boing-pets/contract";
import { assertInteger, clamp } from "../math";
import { rngInt } from "../rng";
import type { WorldEvent, WorldSnapshot } from "../types";

export type ResourceStock = {
  territoryId: number;
  resource: ItemSlug;
  cap: number;
  /** Units still regrowing (active HARVEST plus queued gathers). */
  taken: number;
  free: number;
};

function regrowTicks(snapshot: WorldSnapshot): number {
  return GATHER_RULES.regrowDays * snapshot.ruleset.ticksPerDay;
}

/** Units drawn by HARVEST modifiers active at `tick`. */
export function activeHarvestUnits(
  snapshot: WorldSnapshot,
  territoryId: number,
  tick: number,
): number {
  let units = 0;
  for (const modifier of snapshot.modifiers) {
    if (modifier.kind !== ModifierKind.HARVEST) continue;
    if (modifier.territoryId !== territoryId) continue;
    if (modifier.startTick > tick || tick >= modifier.endTick) continue;
    units += Math.floor(-modifier.amount / GATHER_RULES.foodPerUnit);
  }
  return units;
}

/**
 * Free stock for a territory at `tick`, counting queued (unapplied) gathers
 * with id below `beforeInfluenceId`. Null when nothing grows there.
 */
export function resourceStock(
  snapshot: WorldSnapshot,
  territoryId: number,
  tick: number,
  beforeInfluenceId: number = Number.MAX_SAFE_INTEGER,
): ResourceStock | null {
  const territory = snapshot.territories.find((row) => row.id === territoryId);
  if (!territory) return null;
  const resource = resourceForTerritory(territory.slug);
  if (!resource) return null;
  let taken = activeHarvestUnits(snapshot, territoryId, tick);
  for (const row of snapshot.pendingInfluences) {
    if (row.applied || row.kind !== InfluenceKind.GATHER_RESOURCE) continue;
    if (row.id >= beforeInfluenceId) continue;
    const payload = row.payload as GatherResourcePayload;
    if (payload.territoryId === territoryId) taken += payload.units;
  }
  // The season sets how much a territory holds. When the cap drops with a
  // new season, units already taken simply leave less (never below zero).
  const cap = stockCapFor(
    resource,
    seasonAt(tick, snapshot.ruleset.ticksPerDay).season,
  );
  return {
    territoryId,
    resource,
    cap,
    taken,
    free: Math.max(0, cap - taken),
  };
}

/**
 * Units a gather issued at `tick` with id `influenceId` receives. Pure:
 * (seed, tick, territory, influence id) -> 1..maxYield, capped by free stock.
 */
export function gatherYield(
  snapshot: WorldSnapshot,
  territoryId: number,
  influenceId: number,
  tick: number,
): number {
  const stock = resourceStock(snapshot, territoryId, tick, influenceId);
  if (!stock || stock.free <= 0) return 0;
  const roll = rngInt(
    snapshot.world.seed,
    tick,
    "gather",
    territoryId,
    influenceId,
    GATHER_RULES.minYield,
    GATHER_RULES.maxYield,
  );
  return Math.min(roll, stock.free);
}

export function harvestModifierSpec(
  snapshot: WorldSnapshot,
  units: number,
): { amount: number; durationTicks: number } {
  return {
    amount: assertInteger(-units * GATHER_RULES.foodPerUnit, "harvest"),
    durationTicks: regrowTicks(snapshot),
  };
}

/** Clamp a summed COMFORT bonus to the per-tick ceiling. */
export function comfortRelief(total: number): number {
  return assertInteger(clamp(total, 0, COMFORT_MAX_PER_TICK), "comfort");
}

export { itemDef };

export type RelicTrigger = {
  relic:
    typeof ItemSlugs.RELIC_FIRST_CHILD | typeof ItemSlugs.RELIC_REMEMBRANCE;
  lineageId: number;
  /** Creature whose on-chain owner receives the relic (mother, or the deceased). */
  creatureId: number;
  eventId: number;
  tick: number;
};

/**
 * Relic candidates in a step's events, in event order. A lineage's first
 * non-founder BIRTH is its First Child; its first DEATH is its Remembrance.
 * "First" is enforced by the host mint key (one relic per lineage and kind),
 * so this stays a pure filter over events.
 */
export function relicTriggers(events: readonly WorldEvent[]): RelicTrigger[] {
  const out: RelicTrigger[] = [];
  const ordered = [...events].sort((a, b) => a.id - b.id);
  for (const event of ordered) {
    if (event.lineageId == null) continue;
    if (
      event.kind === EventKind.BIRTH &&
      event.payload.template === EventTemplate.BIRTH &&
      event.subjectId != null
    ) {
      out.push({
        relic: ItemSlugs.RELIC_FIRST_CHILD,
        lineageId: event.lineageId,
        creatureId: event.subjectId,
        eventId: event.id,
        tick: event.tick,
      });
    } else if (event.kind === EventKind.DEATH && event.actorId != null) {
      out.push({
        relic: ItemSlugs.RELIC_REMEMBRANCE,
        lineageId: event.lineageId,
        creatureId: event.actorId,
        eventId: event.id,
        tick: event.tick,
      });
    }
  }
  return out;
}

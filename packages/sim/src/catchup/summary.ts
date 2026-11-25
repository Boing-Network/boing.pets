/**
 * Catch-up report summary: counts and notable ranking for a tick gap.
 * Pure over events + lineages. No wall clock.
 */
import {
  EventKind,
  type BirthEventPayload,
  type CatchupNotable,
  type CatchupSummary,
} from "@boing-pets/contract";
import type { LineageRow, WorldEvent } from "../types";

const NOTABLE_LIMIT = 10;

const RANK_RARE_BIRTH = 90;
const RANK_FAVORED_DEATH = 70;
const RANK_DEATH = 40;
const RANK_DISCOVERY = 35;
const RANK_MATING = 30;
const RANK_MIGRATION = 10;

function hasRareMutation(event: WorldEvent): boolean {
  if (event.kind !== EventKind.BIRTH) return false;
  const payload = event.payload as BirthEventPayload;
  return payload.mutations.some((mutation) => mutation.rare);
}

function lineageFavor(
  lineages: ReadonlyMap<number, LineageRow>,
  lineageId: number | null,
): number {
  if (lineageId == null) return 0;
  return lineages.get(lineageId)?.playerFavor ?? 0;
}

/** Spec ranks for notable selection. Unlisted kinds score 0. */
export function catchupEventRank(
  event: WorldEvent,
  lineages: ReadonlyMap<number, LineageRow>,
): number {
  switch (event.kind) {
    case EventKind.BIRTH:
      return hasRareMutation(event) ? RANK_RARE_BIRTH : 0;
    case EventKind.DEATH:
      return lineageFavor(lineages, event.lineageId) > 0
        ? RANK_FAVORED_DEATH
        : RANK_DEATH;
    case EventKind.DISCOVERY:
      return RANK_DISCOVERY;
    case EventKind.MATING:
      return RANK_MATING;
    case EventKind.MIGRATION:
      return RANK_MIGRATION;
    case EventKind.ITEM:
      // Creature loot / craft / use: everyday activity, never "notable".
      return 0;
    case EventKind.INJURY:
      // Wounds are common; the deaths they lead to are what is notable.
      return 0;
    case EventKind.OUTBREAK:
      return RANK_DISCOVERY;
    default: {
      const never: never = event.kind;
      return never;
    }
  }
}

function selectNotable(
  events: readonly WorldEvent[],
  lineages: ReadonlyMap<number, LineageRow>,
): CatchupNotable[] {
  const ranked = events.map((event) => ({
    event,
    rank: catchupEventRank(event, lineages),
  }));
  ranked.sort((a, b) => {
    if (a.rank !== b.rank) return b.rank - a.rank;
    if (a.event.tick !== b.event.tick) return b.event.tick - a.event.tick;
    return b.event.id - a.event.id;
  });
  return ranked.slice(0, NOTABLE_LIMIT).map(({ event }) => ({
    eventId: event.id,
    tick: event.tick,
    summary: event.summary,
  }));
}

function countKind(events: readonly WorldEvent[], kind: EventKind): number {
  let n = 0;
  for (const event of events) {
    if (event.kind === kind) n += 1;
  }
  return n;
}

/**
 * Aggregate a catch-up gap. Counts must match the event multiset for that gap.
 * `fromTick` / `toTick` are the lastTick bounds (exclusive start, inclusive end).
 */
export function buildCatchupSummary(
  fromTick: number,
  toTick: number,
  events: readonly WorldEvent[],
  lineages: readonly LineageRow[],
): CatchupSummary {
  const byId = new Map<number, LineageRow>();
  for (const lineage of lineages) byId.set(lineage.id, lineage);
  return {
    fromTick,
    toTick,
    births: countKind(events, EventKind.BIRTH),
    deaths: countKind(events, EventKind.DEATH),
    matings: countKind(events, EventKind.MATING),
    migrations: countKind(events, EventKind.MIGRATION),
    discoveries: countKind(events, EventKind.DISCOVERY),
    items: countKind(events, EventKind.ITEM),
    injuries: countKind(events, EventKind.INJURY),
    outbreaks: countKind(events, EventKind.OUTBREAK),
    notable: selectNotable(events, byId),
  };
}

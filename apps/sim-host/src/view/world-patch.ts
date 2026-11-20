/**
 * Build a `world.patch` from the dirty window + current snapshot.
 * Clients replace these rows in their Zustand cache; they never invent rules.
 */
import type { WorldEventView, WorldPatch } from "@boing-pets/contract";
import type { WorldSnapshot } from "@boing-pets/sim";
import type { DirtySet } from "../persist/dirty";
import {
  buildWorldView,
  toCreatureView,
  toMemoryView,
  toRelationshipView,
} from "./world-view";

/**
 * What the last emitted view already told every listener. The dirty window
 * spans a whole commit (several ticks), so without a baseline each live patch
 * would repeat every row and event since the last save; over a socket that
 * grows to tens of KB per tick. With one, a patch carries only rows whose
 * view actually changed since the previous patch/snapshot and only new events.
 */
export type PatchBaseline = {
  creatures: Map<number, string>;
  relationships: Map<number, string>;
  territories: Map<number, string>;
  /** Highest event id already emitted. */
  lastEventId: number;
};

export function createPatchBaseline(): PatchBaseline {
  return {
    creatures: new Map(),
    relationships: new Map(),
    territories: new Map(),
    lastEventId: 0,
  };
}

/** Reset the baseline to a full view that was just emitted. */
export function resetPatchBaseline(
  baseline: PatchBaseline,
  view: {
    creatures: Array<{ id: number }>;
    relationships: Array<{ id: number }>;
    territories: Array<{ id: number }>;
    events: Array<{ id: number }>;
  },
): void {
  baseline.creatures.clear();
  baseline.relationships.clear();
  baseline.territories.clear();
  for (const row of view.creatures)
    baseline.creatures.set(row.id, JSON.stringify(row));
  for (const row of view.relationships) {
    baseline.relationships.set(row.id, JSON.stringify(row));
  }
  for (const row of view.territories) {
    baseline.territories.set(row.id, JSON.stringify(row));
  }
  for (const event of view.events) {
    if (event.id > baseline.lastEventId) baseline.lastEventId = event.id;
  }
}

function changedRows<T extends { id: number }>(
  rows: T[],
  seen: Map<number, string>,
): T[] {
  return rows.filter((row) => {
    const json = JSON.stringify(row);
    if (seen.get(row.id) === json) return false;
    seen.set(row.id, json);
    return true;
  });
}

/**
 * Changed rows only. Falls back to an empty patch when nothing is dirty.
 * Territories are always re-derived so effective food/danger stay honest.
 * Pass a `baseline` to drop rows and events the previous emit already sent.
 */
export function buildWorldPatch(
  snapshot: WorldSnapshot,
  dirty: DirtySet,
  baseline?: PatchBaseline,
): WorldPatch {
  const full = buildWorldView(snapshot);
  const tick = snapshot.world.lastTick;

  const creatureIds = new Set(dirty.creatureIds);
  const relationshipIds = new Set(dirty.relationshipIds);

  const relationshipViews = snapshot.relationships
    .filter((row) => relationshipIds.has(row.id))
    .sort((a, b) => a.id - b.id)
    .map(toRelationshipView);

  const relationshipsByCreature = new Map<
    number,
    ReturnType<typeof toRelationshipView>[]
  >();
  for (const rel of full.relationships) {
    const forA = relationshipsByCreature.get(rel.creatureAId) ?? [];
    forA.push(rel);
    relationshipsByCreature.set(rel.creatureAId, forA);
    const forB = relationshipsByCreature.get(rel.creatureBId) ?? [];
    forB.push(rel);
    relationshipsByCreature.set(rel.creatureBId, forB);
  }

  const memoriesByCreature = new Map<
    number,
    ReturnType<typeof toMemoryView>[]
  >();
  for (const memory of snapshot.memories) {
    if (memory.archived) continue;
    const list = memoriesByCreature.get(memory.creatureId) ?? [];
    list.push(toMemoryView(memory, tick, snapshot.ruleset));
    memoriesByCreature.set(memory.creatureId, list);
  }

  const creatures = snapshot.creatures
    .filter((row) => creatureIds.has(row.id))
    .sort((a, b) => a.id - b.id)
    .map((creature) =>
      toCreatureView(
        creature,
        tick,
        snapshot.ruleset,
        relationshipsByCreature.get(creature.id) ?? [],
        memoriesByCreature.get(creature.id) ?? [],
      ),
    );

  const events: WorldEventView[] = dirty.events
    .slice()
    .sort((a, b) => a.tick - b.tick || a.id - b.id)
    .map((event) => ({
      id: event.id,
      worldId: event.worldId,
      tick: event.tick,
      kind: event.kind,
      actorId: event.actorId,
      subjectId: event.subjectId,
      territoryId: event.territoryId,
      lineageId: event.lineageId,
      summary: event.summary,
      payload: event.payload,
    }));

  if (baseline == null) {
    return {
      tick,
      creatures,
      relationships: relationshipViews,
      events,
      territories: full.territories,
    };
  }
  const freshEvents = events.filter((event) => event.id > baseline.lastEventId);
  for (const event of freshEvents) {
    if (event.id > baseline.lastEventId) baseline.lastEventId = event.id;
  }
  return {
    tick,
    creatures: changedRows(creatures, baseline.creatures),
    relationships: changedRows(relationshipViews, baseline.relationships),
    events: freshEvents,
    territories: changedRows(full.territories, baseline.territories),
  };
}

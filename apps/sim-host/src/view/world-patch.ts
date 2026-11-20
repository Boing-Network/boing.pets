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
 * Changed rows only. Falls back to an empty patch when nothing is dirty.
 * Territories are always re-derived so effective food/danger stay honest.
 */
export function buildWorldPatch(
  snapshot: WorldSnapshot,
  dirty: DirtySet,
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

  return {
    tick,
    creatures,
    relationships: relationshipViews,
    events,
    territories: full.territories,
  };
}

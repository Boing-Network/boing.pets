/**
 * Dirty tracking for a commit window.
 * Needs drift every tick, so every creature alive during the batch is dirty.
 */
import {
  CreatureStatus,
  InfluenceKind,
  type FavorBloodlinePayload,
  type NameLineagePayload,
} from "@boing-pets/contract";
import type {
  CompatibilityRow,
  CreatureRow,
  LineageRow,
  MemoryRow,
  RelationshipRow,
  SpeciesRow,
  TerritoryModifierRow,
  TerritoryRow,
  WorldEvent,
  WorldSnapshot,
} from "@boing-pets/sim";

export type DirtySet = {
  /** Introduce-species migration: species rows to insert or update. */
  species: SpeciesRow[];
  /** Introduce-species migration: new compatibility rows. */
  compatibility: CompatibilityRow[];
  /** Capacity upgrade: existing territories whose capacity rose. */
  territories: TerritoryRow[];
  creatureIds: Set<number>;
  newCreatureIds: Set<number>;
  relationshipIds: Set<number>;
  newRelationshipIds: Set<number>;
  newMemoryIds: Set<number>;
  archiveMemoryIds: Set<number>;
  newModifierIds: Set<number>;
  lineageIds: Set<number>;
  appliedInfluenceIds: Set<number>;
  events: WorldEvent[];
};

export type IdCursors = {
  nextCreatureId: number;
  nextMemoryId: number;
  nextRelationshipId: number;
  nextEventId: number;
  nextLineageId: number;
  nextModifierId: number;
  nextInfluenceId: number;
};

export function createDirtySet(): DirtySet {
  return {
    species: [],
    compatibility: [],
    territories: [],
    creatureIds: new Set(),
    newCreatureIds: new Set(),
    relationshipIds: new Set(),
    newRelationshipIds: new Set(),
    newMemoryIds: new Set(),
    archiveMemoryIds: new Set(),
    newModifierIds: new Set(),
    lineageIds: new Set(),
    appliedInfluenceIds: new Set(),
    events: [],
  };
}

export function clearDirty(dirty: DirtySet): void {
  dirty.species.length = 0;
  dirty.compatibility.length = 0;
  dirty.territories.length = 0;
  dirty.creatureIds.clear();
  dirty.newCreatureIds.clear();
  dirty.relationshipIds.clear();
  dirty.newRelationshipIds.clear();
  dirty.newMemoryIds.clear();
  dirty.archiveMemoryIds.clear();
  dirty.newModifierIds.clear();
  dirty.lineageIds.clear();
  dirty.appliedInfluenceIds.clear();
  dirty.events.length = 0;
}

export function snapshotCursors(snapshot: WorldSnapshot): IdCursors {
  return {
    nextCreatureId: snapshot.world.nextCreatureId,
    nextMemoryId: snapshot.world.nextMemoryId,
    nextRelationshipId: snapshot.world.nextRelationshipId,
    nextEventId: snapshot.world.nextEventId,
    nextLineageId: snapshot.world.nextLineageId,
    nextModifierId: snapshot.world.nextModifierId,
    nextInfluenceId: snapshot.world.nextInfluenceId,
  };
}

/**
 * After one `step`, mark every living (or newly dead) creature dirty, plus
 * inserts allocated from the pre-tick counters.
 */
export function markAfterTick(
  dirty: DirtySet,
  before: IdCursors,
  snapshot: WorldSnapshot,
  events: readonly WorldEvent[],
): void {
  for (const creature of snapshot.creatures) {
    dirty.creatureIds.add(creature.id);
    if (creature.id >= before.nextCreatureId) {
      dirty.newCreatureIds.add(creature.id);
    }
  }
  for (const relationship of snapshot.relationships) {
    dirty.relationshipIds.add(relationship.id);
    if (relationship.id >= before.nextRelationshipId) {
      dirty.newRelationshipIds.add(relationship.id);
    }
  }
  for (const memory of snapshot.memories) {
    if (memory.id >= before.nextMemoryId) dirty.newMemoryIds.add(memory.id);
  }
  for (const modifier of snapshot.modifiers) {
    if (modifier.id >= before.nextModifierId) {
      dirty.newModifierIds.add(modifier.id);
    }
  }
  const dayBoundary =
    snapshot.world.lastTick % snapshot.ruleset.ticksPerDay === 0;
  for (const lineage of snapshot.lineages) {
    if (lineage.id >= before.nextLineageId) dirty.lineageIds.add(lineage.id);
    // Favor fades at day boundaries (decayLineageFavor).
    else if (dayBoundary) {
      dirty.lineageIds.add(lineage.id);
    }
  }
  for (const influence of snapshot.pendingInfluences) {
    if (!influence.applied) continue;
    dirty.appliedInfluenceIds.add(influence.id);
    if (
      influence.kind === InfluenceKind.NAME_LINEAGE ||
      influence.kind === InfluenceKind.FAVOR_BLOODLINE
    ) {
      const payload = influence.payload as
        NameLineagePayload | FavorBloodlinePayload;
      dirty.lineageIds.add(payload.lineageId);
    }
  }
  for (const event of events) dirty.events.push(event);
}

export function pickByIds<T extends { id: number }>(
  rows: readonly T[],
  ids: ReadonlySet<number>,
): T[] {
  return rows.filter((row) => ids.has(row.id));
}

export function newCreatures(
  snapshot: WorldSnapshot,
  dirty: DirtySet,
): CreatureRow[] {
  return pickByIds(snapshot.creatures, dirty.newCreatureIds);
}

export function dirtyCreatures(
  snapshot: WorldSnapshot,
  dirty: DirtySet,
): CreatureRow[] {
  const updates = new Set(
    [...dirty.creatureIds].filter((id) => !dirty.newCreatureIds.has(id)),
  );
  return pickByIds(snapshot.creatures, updates);
}

export function newRelationships(
  snapshot: WorldSnapshot,
  dirty: DirtySet,
): RelationshipRow[] {
  return pickByIds(snapshot.relationships, dirty.newRelationshipIds);
}

export function dirtyRelationships(
  snapshot: WorldSnapshot,
  dirty: DirtySet,
): RelationshipRow[] {
  const updates = new Set(
    [...dirty.relationshipIds].filter(
      (id) => !dirty.newRelationshipIds.has(id),
    ),
  );
  return pickByIds(snapshot.relationships, updates);
}

export function newMemories(
  snapshot: WorldSnapshot,
  dirty: DirtySet,
): MemoryRow[] {
  return pickByIds(snapshot.memories, dirty.newMemoryIds);
}

export function newModifiers(
  snapshot: WorldSnapshot,
  dirty: DirtySet,
): TerritoryModifierRow[] {
  return pickByIds(snapshot.modifiers, dirty.newModifierIds);
}

export function dirtyLineages(
  snapshot: WorldSnapshot,
  dirty: DirtySet,
): LineageRow[] {
  return pickByIds(snapshot.lineages, dirty.lineageIds);
}

/** Drop DEAD rows and pairs/memories that are no longer hot after a commit. */
export function pruneHotSnapshot(snapshot: WorldSnapshot): void {
  const alive = new Set(
    snapshot.creatures
      .filter((row) => row.status === CreatureStatus.ALIVE)
      .map((row) => row.id),
  );
  snapshot.creatures = snapshot.creatures.filter((row) => alive.has(row.id));
  snapshot.relationships = snapshot.relationships.filter(
    (row) => alive.has(row.creatureAId) && alive.has(row.creatureBId),
  );
  snapshot.memories = snapshot.memories.filter(
    (row) => !row.archived && alive.has(row.creatureId),
  );
  snapshot.pendingInfluences = snapshot.pendingInfluences.filter(
    (row) => !row.applied,
  );
}

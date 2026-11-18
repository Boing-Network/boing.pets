/**
 * Commit a dirty batch. Inserts always carry explicit kernel ids.
 */
import type { CatchupReport } from "@boing-pets/contract";
import {
  memoryStrength,
  type WorldEvent,
  type WorldSnapshot,
} from "@boing-pets/sim";
import {
  dirtyCreatures,
  dirtyLineages,
  dirtyRelationships,
  newCreatures,
  newMemories,
  newModifiers,
  newRelationships,
  type DirtySet,
} from "./dirty";
import type { CommitBatch, DurableTables, WorldRepository } from "./repository";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Build the first durable tables from worldgen (explicit ids throughout). */
export function worldgenTables(
  snapshot: WorldSnapshot,
  events: readonly WorldEvent[],
): DurableTables {
  return {
    world: clone(snapshot.world),
    ruleset: clone(snapshot.ruleset),
    species: clone(snapshot.species),
    compatibility: clone(snapshot.compatibility),
    territories: clone(snapshot.territories),
    links: clone(snapshot.links),
    modifiers: clone(snapshot.modifiers),
    lineages: clone(snapshot.lineages),
    creatures: clone(snapshot.creatures),
    relationships: clone(snapshot.relationships),
    memories: clone(snapshot.memories),
    influences: clone(snapshot.pendingInfluences),
    influenceAcceptedAtMs: [],
    events: clone([...events]),
    catchups: [],
  };
}

/**
 * Minor memories whose effective strength is 0 at this tick become archived.
 * Major memories are never archived.
 */
export function collectArchiveIds(
  snapshot: WorldSnapshot,
  dirty: DirtySet,
): number[] {
  const tick = snapshot.world.lastTick;
  const rules = snapshot.ruleset;
  const ids: number[] = [];
  for (const memory of snapshot.memories) {
    if (memory.archived) continue;
    if (memory.importance >= rules.majorImportanceMin) continue;
    if (memoryStrength(memory, tick, rules) !== 0) continue;
    ids.push(memory.id);
    dirty.archiveMemoryIds.add(memory.id);
    memory.archived = true;
  }
  return ids;
}

export function buildCommitBatch(
  snapshot: WorldSnapshot,
  dirty: DirtySet,
  catchup: CatchupReport | null = null,
): CommitBatch {
  const archiveMemoryIds = collectArchiveIds(snapshot, dirty);
  return {
    world: clone(snapshot.world),
    ruleset: clone(snapshot.ruleset),
    insertCreatures: clone(newCreatures(snapshot, dirty)),
    updateCreatures: clone(dirtyCreatures(snapshot, dirty)),
    insertRelationships: clone(newRelationships(snapshot, dirty)),
    updateRelationships: clone(dirtyRelationships(snapshot, dirty)),
    insertMemories: clone(newMemories(snapshot, dirty)),
    archiveMemoryIds,
    insertModifiers: clone(newModifiers(snapshot, dirty)),
    upsertLineages: clone(dirtyLineages(snapshot, dirty)),
    insertEvents: clone(dirty.events),
    insertInfluences: [],
    appliedInfluenceIds: [...dirty.appliedInfluenceIds],
    influenceAcceptedAtMs: null,
    insertCatchup: catchup == null ? null : clone(catchup),
  };
}

export async function saveDirty(
  repository: WorldRepository,
  snapshot: WorldSnapshot,
  dirty: DirtySet,
  catchup: CatchupReport | null = null,
): Promise<void> {
  const batch = buildCommitBatch(snapshot, dirty, catchup);
  await repository.commit(batch);
}

export async function saveWorldgen(
  repository: WorldRepository,
  snapshot: WorldSnapshot,
  events: readonly WorldEvent[],
): Promise<void> {
  await repository.insertWorld(worldgenTables(snapshot, events));
}

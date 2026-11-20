/**
 * Load the hot kernel snapshot from durable tables.
 * Refuse a schema newer than this build. Discoveries come from DISCOVERY events.
 */
import { CreatureStatus, EventKind } from "@boing-pets/contract";
import { CURRENT_SCHEMA_VERSION, discoveriesFromEvents } from "@boing-pets/db";
import { upgradeSnapshotPositions, type WorldSnapshot } from "@boing-pets/sim";
import type { DurableTables, WorldRepository } from "./repository";

export class SchemaTooNewError extends Error {
  readonly schemaVersion: number;
  readonly buildVersion: number;

  constructor(schemaVersion: number, buildVersion: number) {
    super(
      `world schemaVersion ${schemaVersion} is newer than build ${buildVersion}`,
    );
    this.name = "SchemaTooNewError";
    this.schemaVersion = schemaVersion;
    this.buildVersion = buildVersion;
  }
}

function assertKnownSchema(schemaVersion: number): void {
  if (schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new SchemaTooNewError(schemaVersion, CURRENT_SCHEMA_VERSION);
  }
}

/** Map durable tables into the RAM snapshot `step()` expects. */
export function tablesToSnapshot(tables: DurableTables): WorldSnapshot {
  assertKnownSchema(tables.world.schemaVersion);

  const alive = tables.creatures.filter(
    (row) => row.status === CreatureStatus.ALIVE,
  );
  const aliveIds = new Set(alive.map((row) => row.id));

  const relationships = tables.relationships.filter(
    (row) => aliveIds.has(row.creatureAId) && aliveIds.has(row.creatureBId),
  );
  const memories = tables.memories.filter(
    (row) => !row.archived && aliveIds.has(row.creatureId),
  );
  const pendingInfluences = tables.influences.filter((row) => !row.applied);

  const discoveries = discoveriesFromEvents(
    tables.events.filter((event) => event.kind === EventKind.DISCOVERY),
  );

  const snapshot: WorldSnapshot = {
    world: { ...tables.world },
    ruleset: tables.ruleset,
    species: [...tables.species].sort((a, b) => a.id - b.id),
    compatibility: [...tables.compatibility].sort((a, b) => {
      if (a.speciesLowId !== b.speciesLowId) {
        return a.speciesLowId - b.speciesLowId;
      }
      return a.speciesHighId - b.speciesHighId;
    }),
    territories: [...tables.territories].sort((a, b) => a.id - b.id),
    links: [...tables.links].sort((a, b) => {
      if (a.fromId !== b.fromId) return a.fromId - b.fromId;
      return a.toId - b.toId;
    }),
    discoveries,
    modifiers: [...tables.modifiers].sort((a, b) => a.id - b.id),
    lineages: [...tables.lineages].sort((a, b) => a.id - b.id),
    creatures: alive.sort((a, b) => a.id - b.id),
    relationships: relationships.sort((a, b) => a.id - b.id),
    memories: memories.sort((a, b) => a.id - b.id),
    pendingInfluences: pendingInfluences.sort((a, b) => a.id - b.id),
  };
  // Schema 1 → 2: give legacy creatures deterministic positions. Pure
  // function of (seed, lastTick, id), so a crash before the first commit
  // re-derives the same spots on the next load.
  upgradeSnapshotPositions(snapshot);
  return snapshot;
}

export type LoadedWorld = {
  snapshot: WorldSnapshot;
  /** Stored schema version when load upgraded it in RAM, else null. */
  upgradedFromSchema: number | null;
};

/** Read the single world plus upgrade info, or null when the store is empty. */
export async function loadWorld(
  repository: WorldRepository,
): Promise<LoadedWorld | null> {
  const tables = await repository.readTables();
  if (tables == null) return null;
  const stored = tables.world.schemaVersion;
  const snapshot = tablesToSnapshot(tables);
  return {
    snapshot,
    upgradedFromSchema: snapshot.world.schemaVersion !== stored ? stored : null,
  };
}

/** Read the single world, or null when the store is empty. */
export async function loadSnapshot(
  repository: WorldRepository,
): Promise<WorldSnapshot | null> {
  return (await loadWorld(repository))?.snapshot ?? null;
}

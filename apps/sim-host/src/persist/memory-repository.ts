/**
 * In-memory durable store for tests and crash-redo.
 * Commits are atomic: a failed mid-write leaves the previous committed tables.
 */
import type { AssetMintLinkRow } from "../boing/asset-mint-link";
import type { CreatureNftLinkRow } from "../boing/nft-link";
import type {
  CommitBatch,
  DurableTables,
  PersistedHostClock,
  WorldRepository,
} from "./repository";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function indexById<T extends { id: number }>(rows: T[]): Map<number, T> {
  const map = new Map<number, T>();
  for (const row of rows) {
    if (map.has(row.id)) {
      throw new Error(`duplicate id ${row.id}`);
    }
    map.set(row.id, row);
  }
  return map;
}

function assertExplicitIds<T extends { id: number }>(
  rows: readonly T[],
  label: string,
): void {
  for (const row of rows) {
    if (!Number.isSafeInteger(row.id) || row.id <= 0) {
      throw new Error(`${label} missing explicit id`);
    }
  }
}

export class MemoryWorldRepository implements WorldRepository {
  #tables: DurableTables | null = null;

  async readTables(): Promise<DurableTables | null> {
    return this.#tables == null ? null : clone(this.#tables);
  }

  async readHostClock(): Promise<PersistedHostClock | null> {
    const saved = this.#tables?.hostClock;
    return saved == null ? null : { ...saved };
  }

  async writeHostClock(clock: PersistedHostClock): Promise<void> {
    if (this.#tables == null) throw new Error("no world");
    this.#tables.hostClock = { scale: clock.scale };
  }

  async insertWorld(tables: DurableTables): Promise<void> {
    if (this.#tables != null) throw new Error("world already exists");
    assertExplicitIds([tables.world], "world");
    assertExplicitIds(tables.species, "species");
    assertExplicitIds(tables.territories, "territory");
    assertExplicitIds(tables.modifiers, "modifier");
    assertExplicitIds(tables.lineages, "lineage");
    assertExplicitIds(tables.creatures, "creature");
    assertExplicitIds(tables.relationships, "relationship");
    assertExplicitIds(tables.memories, "memory");
    assertExplicitIds(tables.influences, "influence");
    assertExplicitIds(tables.events, "event");
    assertExplicitIds(tables.catchups, "catchup");
    if (!Array.isArray(tables.influenceAcceptedAtMs)) {
      throw new Error("influenceAcceptedAtMs");
    }
    if (
      tables.influenceAcceptedByAccount == null ||
      typeof tables.influenceAcceptedByAccount !== "object" ||
      Array.isArray(tables.influenceAcceptedByAccount)
    ) {
      tables.influenceAcceptedByAccount = {
        local: [...tables.influenceAcceptedAtMs],
      };
    }
    if (!Array.isArray(tables.creatureNftLinks)) {
      throw new Error("creatureNftLinks");
    }
    if (!Array.isArray(tables.assetMintLinks)) {
      throw new Error("assetMintLinks");
    }
    this.#tables = clone(tables);
  }

  async commit(batch: CommitBatch): Promise<void> {
    if (this.#tables == null) throw new Error("no world");
    // Mutate a clone; publish only after the whole batch validates so a
    // mid-write throw leaves the previous committed tables untouched.
    const next = clone(this.#tables);
    next.world = clone(batch.world);
    next.ruleset = clone(batch.ruleset);

    assertExplicitIds(batch.insertCreatures, "creature");
    assertExplicitIds(batch.insertRelationships, "relationship");
    assertExplicitIds(batch.insertMemories, "memory");
    assertExplicitIds(batch.insertModifiers, "modifier");
    assertExplicitIds(batch.upsertLineages, "lineage");
    assertExplicitIds(batch.insertEvents, "event");
    assertExplicitIds(batch.insertInfluences, "influence");

    const creatures = indexById(next.creatures);
    for (const row of batch.insertCreatures) {
      if (creatures.has(row.id)) {
        throw new Error(`creature id ${row.id} already exists`);
      }
      creatures.set(row.id, clone(row));
    }
    for (const row of batch.updateCreatures) {
      if (!creatures.has(row.id)) {
        throw new Error(`creature id ${row.id} missing for update`);
      }
      creatures.set(row.id, clone(row));
    }
    next.creatures = [...creatures.values()].sort((a, b) => a.id - b.id);

    const relationships = indexById(next.relationships);
    for (const row of batch.insertRelationships) {
      if (relationships.has(row.id)) {
        throw new Error(`relationship id ${row.id} already exists`);
      }
      relationships.set(row.id, clone(row));
    }
    for (const row of batch.updateRelationships) {
      if (!relationships.has(row.id)) {
        throw new Error(`relationship id ${row.id} missing for update`);
      }
      relationships.set(row.id, clone(row));
    }
    next.relationships = [...relationships.values()].sort(
      (a, b) => a.id - b.id,
    );

    const memories = indexById(next.memories);
    for (const row of batch.insertMemories) {
      if (memories.has(row.id)) {
        throw new Error(`memory id ${row.id} already exists`);
      }
      memories.set(row.id, clone(row));
    }
    for (const id of batch.archiveMemoryIds) {
      const row = memories.get(id);
      if (!row) throw new Error(`memory id ${id} missing for archive`);
      row.archived = true;
    }
    next.memories = [...memories.values()].sort((a, b) => a.id - b.id);

    const modifiers = indexById(next.modifiers);
    for (const row of batch.insertModifiers) {
      if (modifiers.has(row.id)) {
        throw new Error(`modifier id ${row.id} already exists`);
      }
      modifiers.set(row.id, clone(row));
    }
    next.modifiers = [...modifiers.values()].sort((a, b) => a.id - b.id);

    const lineages = indexById(next.lineages);
    for (const row of batch.upsertLineages) {
      lineages.set(row.id, clone(row));
    }
    next.lineages = [...lineages.values()].sort((a, b) => a.id - b.id);

    const events = indexById(next.events);
    for (const row of batch.insertEvents) {
      if (events.has(row.id)) {
        throw new Error(`event id ${row.id} already exists`);
      }
      events.set(row.id, clone(row));
    }
    next.events = [...events.values()].sort((a, b) => {
      if (a.tick !== b.tick) return a.tick - b.tick;
      return a.id - b.id;
    });

    const influences = indexById(next.influences);
    for (const row of batch.insertInfluences) {
      if (influences.has(row.id)) {
        throw new Error(`influence id ${row.id} already exists`);
      }
      influences.set(row.id, clone(row));
    }
    const applied = new Set(batch.appliedInfluenceIds);
    next.influences = [...influences.values()]
      .map((row) => (applied.has(row.id) ? { ...row, applied: true } : row))
      .sort((a, b) => a.id - b.id);

    if (batch.influenceAcceptedAtMs != null) {
      next.influenceAcceptedAtMs = clone(batch.influenceAcceptedAtMs);
    }
    if (batch.influenceAcceptedByAccount != null) {
      next.influenceAcceptedByAccount = clone(batch.influenceAcceptedByAccount);
      if (next.influenceAcceptedByAccount.local != null) {
        next.influenceAcceptedAtMs = clone(
          next.influenceAcceptedByAccount.local,
        );
      }
    } else if (batch.influenceAcceptedAtMs != null) {
      next.influenceAcceptedByAccount = {
        ...next.influenceAcceptedByAccount,
        local: clone(batch.influenceAcceptedAtMs),
      };
    }

    if (batch.insertCatchup != null) {
      assertExplicitIds([batch.insertCatchup], "catchup");
      const catchups = indexById(next.catchups);
      if (catchups.has(batch.insertCatchup.id)) {
        throw new Error(`catchup id ${batch.insertCatchup.id} already exists`);
      }
      catchups.set(batch.insertCatchup.id, clone(batch.insertCatchup));
      next.catchups = [...catchups.values()].sort((a, b) => a.id - b.id);
    }

    this.#tables = next;
  }

  async readCreatureNftLinks(): Promise<CreatureNftLinkRow[]> {
    if (this.#tables == null) return [];
    return clone(this.#tables.creatureNftLinks).sort(
      (a, b) => a.creatureId - b.creatureId,
    );
  }

  async upsertCreatureNftLink(row: CreatureNftLinkRow): Promise<void> {
    if (this.#tables == null) throw new Error("no world");
    const next = clone(this.#tables);
    const idx = next.creatureNftLinks.findIndex(
      (link) => link.creatureId === row.creatureId,
    );
    if (idx >= 0) {
      next.creatureNftLinks[idx] = clone(row);
    } else {
      next.creatureNftLinks.push(clone(row));
    }
    next.creatureNftLinks.sort((a, b) => a.creatureId - b.creatureId);
    this.#tables = next;
  }

  async readAssetMintLinks(): Promise<AssetMintLinkRow[]> {
    if (this.#tables == null) return [];
    return clone(this.#tables.assetMintLinks).sort((a, b) => {
      if (a.worldId !== b.worldId) return a.worldId - b.worldId;
      if (a.tokenClass !== b.tokenClass) {
        return a.tokenClass.localeCompare(b.tokenClass);
      }
      return a.mintKey.localeCompare(b.mintKey);
    });
  }

  async upsertAssetMintLink(row: AssetMintLinkRow): Promise<void> {
    if (this.#tables == null) throw new Error("no world");
    const next = clone(this.#tables);
    const idx = next.assetMintLinks.findIndex(
      (link) =>
        link.worldId === row.worldId &&
        link.tokenClass === row.tokenClass &&
        link.mintKey === row.mintKey,
    );
    if (idx >= 0) {
      next.assetMintLinks[idx] = clone(row);
    } else {
      next.assetMintLinks.push(clone(row));
    }
    next.assetMintLinks.sort((a, b) => {
      if (a.worldId !== b.worldId) return a.worldId - b.worldId;
      if (a.tokenClass !== b.tokenClass) {
        return a.tokenClass.localeCompare(b.tokenClass);
      }
      return a.mintKey.localeCompare(b.mintKey);
    });
    this.#tables = next;
  }
}

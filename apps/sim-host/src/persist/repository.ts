/**
 * Durability boundary. Postgres is the production store; tests use memory.
 * Every insert carries an explicit kernel-assigned id — no database sequences.
 */
import type { CatchupReport, Ruleset, TimeScale } from "@boing-pets/contract";
import type {
  CompatibilityRow,
  CreatureRow,
  LineageRow,
  MemoryRow,
  PlayerInfluenceRow,
  RelationshipRow,
  SpeciesRow,
  TerritoryLinkRow,
  TerritoryModifierRow,
  TerritoryRow,
  WorldEvent,
  WorldHeader,
} from "@boing-pets/sim";
import type { AssetMintLinkRow } from "../boing/asset-mint-link";
import type {
  InfluenceAccountRow,
  InventoryLotRow,
  ItemAutonomyRow,
  ItemChange,
} from "../items/types";
import type { CreatureNftLinkRow } from "../boing/nft-link";

/**
 * Host clock preferences that survive a restart. Only the time scale is kept:
 * closing the game is not a pause (time after exit is owed on next launch),
 * so `paused` is deliberately not persisted.
 */
export type PersistedHostClock = {
  scale: TimeScale;
};

export type DurableTables = {
  world: WorldHeader;
  ruleset: Ruleset;
  species: SpeciesRow[];
  compatibility: CompatibilityRow[];
  territories: TerritoryRow[];
  links: TerritoryLinkRow[];
  modifiers: TerritoryModifierRow[];
  lineages: LineageRow[];
  creatures: CreatureRow[];
  relationships: RelationshipRow[];
  memories: MemoryRow[];
  influences: PlayerInfluenceRow[];
  /**
   * Wall-clock accept times for the host rate limit (3 / 24h).
   * Legacy / local single-player account. Not read by `step()`.
   */
  influenceAcceptedAtMs: number[];
  /**
   * Per-account accept times (M22). Keyed by accountId. The `"local"` entry
   * mirrors `influenceAcceptedAtMs` for single-player compatibility.
   */
  influenceAcceptedByAccount: Record<string, number[]>;
  events: WorldEvent[];
  catchups: CatchupReport[];
  /**
   * Host-edge creature ↔ Boing NFT links (M20). Not part of the hot snapshot;
   * `tablesToSnapshot` must ignore this field.
   */
  creatureNftLinks: CreatureNftLinkRow[];
  /**
   * Host-edge lineage artifact + compressed item mint links (M21).
   * Not part of the hot snapshot.
   */
  assetMintLinks: AssetMintLinkRow[];
  /** Host-edge clock preference (scale). Absent on older saves. */
  hostClock?: PersistedHostClock | null;
};

export type CommitBatch = {
  world: WorldHeader;
  ruleset: Ruleset;
  insertCreatures: CreatureRow[];
  updateCreatures: CreatureRow[];
  insertRelationships: RelationshipRow[];
  updateRelationships: RelationshipRow[];
  insertMemories: MemoryRow[];
  archiveMemoryIds: number[];
  insertModifiers: TerritoryModifierRow[];
  upsertLineages: LineageRow[];
  insertEvents: WorldEvent[];
  insertInfluences: PlayerInfluenceRow[];
  appliedInfluenceIds: number[];
  /** Replace the durable accept-time log when non-null. */
  influenceAcceptedAtMs: number[] | null;
  /** Replace the per-account accept log when non-null (M22). */
  influenceAcceptedByAccount: Record<string, number[]> | null;
  /** Set when this commit closes an offline catch-up gap. */
  insertCatchup: CatchupReport | null;
  /**
   * Introduce-species migration only: new species rows (insert) and catalog
   * diet refreshes (update). Written before creatures. Absent otherwise.
   */
  upsertSpecies?: SpeciesRow[];
  /** Introduce-species migration only: compatibility rows for new species. */
  insertCompatibility?: CompatibilityRow[];
};

export type WorldRepository = {
  /** Returns null when the database has no world row. */
  readTables(): Promise<DurableTables | null>;
  /** First save after `createWorld`. All rows use explicit ids. */
  insertWorld(tables: DurableTables): Promise<void>;
  /** One transaction of dirty writes. Failure must leave the store unchanged. */
  commit(batch: CommitBatch): Promise<void>;
  /** M20: read creature NFT links (outside hot snapshot). */
  readCreatureNftLinks(): Promise<CreatureNftLinkRow[]>;
  /** M20: upsert by creatureId. */
  upsertCreatureNftLink(row: CreatureNftLinkRow): Promise<void>;
  /** M21: read asset mint links (artifacts + compressed items). */
  readAssetMintLinks(): Promise<AssetMintLinkRow[]>;
  /** M21: upsert by (worldId, tokenClass, mintKey). */
  upsertAssetMintLink(row: AssetMintLinkRow): Promise<void>;
  /** M22: off-chain inventory lots for a world. Optional for test doubles. */
  readInventoryLots?(worldId: number): Promise<InventoryLotRow[]>;
  /** M22: account behind each accepted influence. */
  readInfluenceAccounts?(worldId: number): Promise<InfluenceAccountRow[]>;
  /** M22: one transaction of lot upserts and influence-account inserts. */
  commitItems?(change: ItemChange): Promise<void>;
  /** Creature autonomy toggles per keeper (no row: both on). */
  readItemAutonomy?(worldId: number): Promise<ItemAutonomyRow[]>;
  /** Saved clock preference, or null when never set. Optional for test doubles. */
  readHostClock?(): Promise<PersistedHostClock | null>;
  /** Persist the clock preference (outside the tick commit). */
  writeHostClock?(clock: PersistedHostClock): Promise<void>;
};

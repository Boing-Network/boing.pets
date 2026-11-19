/**
 * Durability boundary. Postgres is the production store; tests use memory.
 * Every insert carries an explicit kernel-assigned id — no database sequences.
 */
import type { CatchupReport, Ruleset } from "@boing-pets/contract";
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
import type { CreatureNftLinkRow } from "../boing/nft-link";

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
   * Not read by `step()`.
   */
  influenceAcceptedAtMs: number[];
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
  /** Set when this commit closes an offline catch-up gap. */
  insertCatchup: CatchupReport | null;
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
};

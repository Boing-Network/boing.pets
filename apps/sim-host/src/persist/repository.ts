/**
 * Durability boundary. Postgres is the production store; tests use memory.
 * Every insert carries an explicit kernel-assigned id — no database sequences.
 */
import type { Ruleset } from "@boing-pets/contract";
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
  events: WorldEvent[];
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
  appliedInfluenceIds: number[];
};

export type WorldRepository = {
  /** Returns null when the database has no world row. */
  readTables(): Promise<DurableTables | null>;
  /** First save after `createWorld`. All rows use explicit ids. */
  insertWorld(tables: DurableTables): Promise<void>;
  /** One transaction of dirty writes. Failure must leave the store unchanged. */
  commit(batch: CommitBatch): Promise<void>;
};

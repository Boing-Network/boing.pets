/**
 * M22 host-edge item rows. Never part of the hot step() snapshot.
 */
import type { InfluenceKind } from "@boing-pets/contract";

export type InventoryLotRow = {
  id: number;
  worldId: number;
  accountId: string;
  /**
   * Idempotency key within the world: gather:<influenceId>, craft:<lotId>,
   * mint:<assetMintKey>, reward:<assetMintKey>, loot:<eventId>,
   * acraft:<influenceId>, ilist / ibuy / iret (item escrow).
   */
  sourceKey: string;
  itemSlug: string;
  amount: number;
  remaining: number;
  gainedTick: number;
  spoilsAtTick: number | null;
  /**
   * The units exist as LPIT on chain (reward mint, mint on demand, or item
   * escrow lock / fill / return). Creatures never use minted units. Absent
   * means false. Set when the lot is created; never changes.
   */
  minted?: boolean;
  createdAtMs: number;
  updatedAtMs: number;
};

/** Per keeper autonomy toggles (no row: both on). */
export type ItemAutonomyRow = {
  worldId: number;
  accountId: string;
  autoCraft: boolean;
  autoUse: boolean;
  updatedAtMs: number;
};

export type InfluenceAccountRow = {
  influenceId: number;
  worldId: number;
  accountId: string;
  kind: InfluenceKind;
  lineageId: number | null;
  territoryId: number | null;
  itemSlug: string | null;
  acceptedAtMs: number;
};

export type ItemChange = {
  /** Upsert by (worldId, sourceKey); an existing key keeps its id. */
  upsertLots: InventoryLotRow[];
  /** Insert-if-absent by influenceId. */
  insertInfluenceAccounts: InfluenceAccountRow[];
  /** Upsert by (worldId, accountId). */
  upsertAutonomy?: ItemAutonomyRow[];
};

/** Optional repository seam (memory, browser, Prisma). */
export type ItemStore = {
  readInventoryLots(worldId: number): Promise<InventoryLotRow[]>;
  readInfluenceAccounts(worldId: number): Promise<InfluenceAccountRow[]>;
  readItemAutonomy?(worldId: number): Promise<ItemAutonomyRow[]>;
  /** One transaction. */
  commitItems(change: ItemChange): Promise<void>;
};

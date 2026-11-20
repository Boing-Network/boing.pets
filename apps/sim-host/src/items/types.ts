/**
 * M22 host-edge item rows. Never part of the hot step() snapshot.
 */
import type { InfluenceKind } from "@boing-pets/contract";

export type InventoryLotRow = {
  id: number;
  worldId: number;
  accountId: string;
  /** Idempotency key within the world (gather:<id>, craft:<lotId>, mint:<key>). */
  sourceKey: string;
  itemSlug: string;
  amount: number;
  remaining: number;
  gainedTick: number;
  spoilsAtTick: number | null;
  createdAtMs: number;
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
};

/** Optional repository seam (memory, browser, Prisma). */
export type ItemStore = {
  readInventoryLots(worldId: number): Promise<InventoryLotRow[]>;
  readInfluenceAccounts(worldId: number): Promise<InfluenceAccountRow[]>;
  /** One transaction. */
  commitItems(change: ItemChange): Promise<void>;
};

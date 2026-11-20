/**
 * creatureId ↔ Boing NFT token link. Host edge only — never in packages/sim
 * or the hot step() snapshot.
 */
import { referenceNftTokenIdWordFromU64 } from "@boing-network/boing-sdk";

export const NftMintStatus = {
  PENDING: "PENDING",
  SUBMITTED: "SUBMITTED",
  CONFIRMED: "CONFIRMED",
  FAILED: "FAILED",
} as const;

export type NftMintStatus = (typeof NftMintStatus)[keyof typeof NftMintStatus];

export type CreatureNftLinkRow = {
  /** Surrogate id; Living Pets uses creatureId (1:1). */
  id: number;
  worldId: number;
  creatureId: number;
  birthEventId: number | null;
  /** Founder minted as part of the genesis set. Absent on older rows = false. */
  genesis?: boolean;
  collectionHex: string;
  tokenIdHex: string;
  chainId: string;
  templateArtifact: string;
  templateVersion: string;
  mintTxHex: string | null;
  status: NftMintStatus;
  lastError: string | null;
  createdAtMs: number;
  updatedAtMs: number;
};

/** Placeholder collection when minting is enabled but collection hex is unset. */
export const UNCONFIGURED_COLLECTION_HEX = `0x${"00".repeat(32)}`;

export function tokenIdHexForCreature(creatureId: number): string {
  if (!Number.isInteger(creatureId) || creatureId < 1) {
    throw new Error("creatureId must be a positive integer");
  }
  return referenceNftTokenIdWordFromU64(creatureId);
}

export function isTerminalMintStatus(status: NftMintStatus): boolean {
  return (
    status === NftMintStatus.CONFIRMED || status === NftMintStatus.SUBMITTED
  );
}

export function isRetryableMintStatus(status: NftMintStatus): boolean {
  return status === NftMintStatus.PENDING || status === NftMintStatus.FAILED;
}

/**
 * Durable store for creature NFT links. Implementations must not feed these
 * rows into the hot kernel snapshot.
 */
export type CreatureNftLinkStore = {
  list(): Promise<CreatureNftLinkRow[]>;
  getByCreatureId(creatureId: number): Promise<CreatureNftLinkRow | null>;
  upsert(row: CreatureNftLinkRow): Promise<void>;
};

/** In-memory store for tests and disabled edges without a repository. */
export class MemoryCreatureNftLinkStore implements CreatureNftLinkStore {
  #byCreature = new Map<number, CreatureNftLinkRow>();

  async list(): Promise<CreatureNftLinkRow[]> {
    return [...this.#byCreature.values()].sort(
      (a, b) => a.creatureId - b.creatureId,
    );
  }

  async getByCreatureId(
    creatureId: number,
  ): Promise<CreatureNftLinkRow | null> {
    return this.#byCreature.get(creatureId) ?? null;
  }

  async upsert(row: CreatureNftLinkRow): Promise<void> {
    this.#byCreature.set(row.creatureId, { ...row });
  }
}

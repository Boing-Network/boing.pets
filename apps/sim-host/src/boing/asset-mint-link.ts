/**
 * Host-edge mint links for non-creature asset classes (M21).
 * Outside the hot step() snapshot — never read by packages/sim.
 */
import {
  multiTokenItemIdWord,
  referenceNftTokenIdWordFromU64,
} from "@boing-network/boing-sdk";
import {
  isRetryableMintStatus,
  isTerminalMintStatus,
  NftMintStatus,
  UNCONFIGURED_COLLECTION_HEX,
  type NftMintStatus as NftMintStatusType,
} from "./nft-link";
import {
  AssetMintClass,
  type LineageArtifactKind,
  type PersistedAssetMintClass,
} from "./taxonomy";

export { NftMintStatus, isRetryableMintStatus, isTerminalMintStatus };
export { UNCONFIGURED_COLLECTION_HEX };

export type AssetMintLinkRow = {
  id: number;
  worldId: number;
  tokenClass: PersistedAssetMintClass;
  /** Idempotency key within (worldId, tokenClass). */
  mintKey: string;
  lineageId: number | null;
  artifactKind: LineageArtifactKind | string | null;
  /** Unique artifact collection serial (null for COMPRESSED_ITEM). */
  tokenSerial: number | null;
  itemKindId: number | null;
  amount: number | null;
  itemSlug: string | null;
  collectionHex: string;
  /** Unique NFT token word, or multi-token item id word for COMPRESSED_ITEM. */
  tokenIdHex: string;
  chainId: string;
  templateArtifact: string;
  templateVersion: string;
  mintTxHex: string | null;
  status: NftMintStatusType;
  lastError: string | null;
  createdAtMs: number;
  updatedAtMs: number;
};

/** Stable positive surrogate id from world + class + mintKey. */
export function assetMintLinkId(
  worldId: number,
  tokenClass: PersistedAssetMintClass,
  mintKey: string,
): number {
  const s = `${worldId}\0${tokenClass}\0${mintKey}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 0x7fffffff || 1;
}

export function tokenIdHexForArtifactSerial(tokenSerial: number): string {
  if (!Number.isInteger(tokenSerial) || tokenSerial < 1) {
    throw new Error("tokenSerial must be a positive integer");
  }
  return referenceNftTokenIdWordFromU64(tokenSerial);
}

export function tokenIdHexForCompressedItem(itemKindId: number): string {
  if (!Number.isInteger(itemKindId) || itemKindId < 0) {
    throw new Error("itemKindId must be a non-negative integer");
  }
  return multiTokenItemIdWord(itemKindId);
}

export type AssetMintLinkStore = {
  list(): Promise<AssetMintLinkRow[]>;
  getByMintKey(
    worldId: number,
    tokenClass: PersistedAssetMintClass,
    mintKey: string,
  ): Promise<AssetMintLinkRow | null>;
  upsert(row: AssetMintLinkRow): Promise<void>;
};

export class MemoryAssetMintLinkStore implements AssetMintLinkStore {
  #byKey = new Map<string, AssetMintLinkRow>();

  static key(
    worldId: number,
    tokenClass: PersistedAssetMintClass,
    mintKey: string,
  ): string {
    return `${worldId}|${tokenClass}|${mintKey}`;
  }

  async list(): Promise<AssetMintLinkRow[]> {
    return [...this.#byKey.values()].sort((a, b) => {
      if (a.worldId !== b.worldId) return a.worldId - b.worldId;
      if (a.tokenClass !== b.tokenClass) {
        return a.tokenClass.localeCompare(b.tokenClass);
      }
      return a.mintKey.localeCompare(b.mintKey);
    });
  }

  async getByMintKey(
    worldId: number,
    tokenClass: PersistedAssetMintClass,
    mintKey: string,
  ): Promise<AssetMintLinkRow | null> {
    return (
      this.#byKey.get(
        MemoryAssetMintLinkStore.key(worldId, tokenClass, mintKey),
      ) ?? null
    );
  }

  async upsert(row: AssetMintLinkRow): Promise<void> {
    this.#byKey.set(
      MemoryAssetMintLinkStore.key(row.worldId, row.tokenClass, row.mintKey),
      { ...row },
    );
  }
}

export function isUniqueNftClass(tokenClass: string): boolean {
  return (
    tokenClass === AssetMintClass.UNIQUE_CREATURE ||
    tokenClass === AssetMintClass.UNIQUE_LINEAGE_ARTIFACT
  );
}

export function isCompressedItemClass(tokenClass: string): boolean {
  return tokenClass === AssetMintClass.COMPRESSED_ITEM;
}

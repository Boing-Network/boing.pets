/**
 * Host-edge Boing NFT client types.
 * Minting lives only here — never inside packages/sim or step().
 */
import type { AssetMintClass } from "./taxonomy";

/** Job shape M20 queues after a BIRTH commit. */
export type CreatureMintJob = {
  worldId: number;
  creatureId: number;
  /** Durable BIRTH world_event id when known. */
  birthEventId: number | null;
  birthTick: number;
  /** 32-byte metadata hash hex, or null to skip on-chain metadata SSTORE. */
  metadataHashHex: string | null;
};

/** M21: unique lineage/story artifact mint job (host-edge hook). */
export type LineageArtifactMintJob = {
  worldId: number;
  /** Idempotency key within UNIQUE_LINEAGE_ARTIFACT for this world. */
  mintKey: string;
  /** Sequential token id in the artifact collection (unique NFT). */
  tokenSerial: number;
  lineageId: number | null;
  artifactKind: string;
  metadataHashHex: string | null;
  /** Player wallet to receive it; omitted/null mints to the operator. */
  recipientHex?: string | null;
};

/** M21: compressed / fungible-like item mint job (reference multi-token). */
export type CompressedItemMintJob = {
  worldId: number;
  /** Idempotency key within COMPRESSED_ITEM for this world. */
  mintKey: string;
  itemKindId: number;
  amount: number;
  itemSlug: string;
  metadataHashHex: string | null;
  /** Player wallet to receive it; omitted/null mints to the operator. */
  recipientHex?: string | null;
};

export type BoingNftProbeResult = {
  rpcUrl: string;
  chainHeight: number;
  chainIdDecimal: number;
  templateArtifactId: string;
  templateVersion: string;
};

export type BoingCollectionDeployPlan = {
  /** Boing Express / wallet `contract_deploy_meta` object from the SDK. */
  deployMeta: {
    type: "contract_deploy_meta";
    bytecode: `0x${string}`;
    purpose_category: string;
    asset_name: string;
    asset_symbol: string;
    description_hash?: `0x${string}`;
    create2_salt?: `0x${string}`;
  };
  templateArtifactId: string;
  templateVersion: string;
  tokenClass: AssetMintClass;
};

export type BoingMintBatchPlan = {
  collectionHex: string;
  toHex: string;
  tokenIdHex: string;
  /** Reference NFT `mint_batch` calldata (0x hex). */
  calldataHex: string;
  calldataBytes: Uint8Array;
  tokenClass: AssetMintClass;
};

export type BoingCompressedItemMintPlan = {
  collectionHex: string;
  toHex: string;
  itemKindId: number;
  amount: number;
  tokenIdHex: string;
  /** Reference multi-token `mint` calldata. */
  calldataHex: string;
  calldataBytes: Uint8Array;
  tokenClass: AssetMintClass;
};

export type BoingMintSubmitResult = {
  txHash: string;
  collectionHex: string;
  tokenIdHex: string;
};

/**
 * Talks to Boing testnet through the existing NFT deployment system
 * (`@boing-network/boing-sdk` reference NFT + reference multi-token).
 */
export type BoingNftClient = {
  readonly enabled: boolean;
  /** Read-only RPC probe. Disabled client returns null without network I/O. */
  probe(): Promise<BoingNftProbeResult | null>;
  /** Build a creature collection deploy meta tx (canonical reference NFT). */
  planCollectionDeploy(): BoingCollectionDeployPlan;
  /** Unique lineage/story artifact collection (same NFT template, distinct labels). */
  planArtifactCollectionDeploy(): BoingCollectionDeployPlan;
  /** Compressed item collection (reference multi-token / fungible-like). */
  planItemCollectionDeploy(): BoingCollectionDeployPlan;
  /**
   * Encode a single-creature mint via reference `mint_batch` (n=1).
   * Does not submit.
   */
  planCreatureMint(input: {
    collectionHex: string;
    toHex: string;
    creatureId: number;
    metadataHashHex?: string | null;
  }): BoingMintBatchPlan;
  /** Encode a unique lineage/story artifact mint (reference mint_batch n=1). */
  planLineageArtifactMint(input: {
    collectionHex: string;
    toHex: string;
    tokenSerial: number;
    metadataHashHex?: string | null;
  }): BoingMintBatchPlan;
  /** Encode a compressed item mint (reference multi-token mint). */
  planCompressedItemMint(input: {
    collectionHex: string;
    toHex: string;
    itemKindId: number;
    amount: number;
  }): BoingCompressedItemMintPlan;
  /**
   * Submit a planned unique NFT mint when secrets + collection are configured.
   */
  submitCreatureMint(plan: BoingMintBatchPlan): Promise<BoingMintSubmitResult>;
  submitLineageArtifactMint(
    plan: BoingMintBatchPlan,
  ): Promise<BoingMintSubmitResult>;
  submitCompressedItemMint(
    plan: BoingCompressedItemMintPlan,
  ): Promise<BoingMintSubmitResult>;
};

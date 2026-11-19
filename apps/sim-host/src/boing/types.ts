/**
 * Host-edge Boing NFT client types.
 * Minting lives only here — never inside packages/sim or step().
 */

/** Job shape M20 will queue after a BIRTH commit. M19 defines the seam only. */
export type CreatureMintJob = {
  worldId: number;
  creatureId: number;
  /** Durable BIRTH world_event id when known. */
  birthEventId: number | null;
  birthTick: number;
  /** 32-byte metadata hash hex, or null to skip on-chain metadata SSTORE. */
  metadataHashHex: string | null;
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
};

export type BoingMintBatchPlan = {
  collectionHex: string;
  toHex: string;
  tokenIdHex: string;
  /** Reference NFT `mint_batch` calldata (0x hex). */
  calldataHex: string;
  calldataBytes: Uint8Array;
};

export type BoingMintSubmitResult = {
  txHash: string;
  collectionHex: string;
  tokenIdHex: string;
};

/**
 * Talks to Boing testnet through the existing NFT deployment system
 * (`@boing-network/boing-sdk` reference NFT collection + mint_batch).
 */
export type BoingNftClient = {
  readonly enabled: boolean;
  /** Read-only RPC probe. Disabled client returns null without network I/O. */
  probe(): Promise<BoingNftProbeResult | null>;
  /** Build a collection deploy meta tx (canonical reference NFT v3 template). */
  planCollectionDeploy(): BoingCollectionDeployPlan;
  /**
   * Encode a single-creature mint via reference `mint_batch` (n=1).
   * Does not submit. M20 will call this after BIRTH commit.
   */
  planCreatureMint(input: {
    collectionHex: string;
    toHex: string;
    creatureId: number;
    metadataHashHex?: string | null;
  }): BoingMintBatchPlan;
  /**
   * Submit a planned mint when secrets + collection are configured.
   * Disabled / incomplete config throws. M19 leaves birth wiring to M20.
   */
  submitCreatureMint(plan: BoingMintBatchPlan): Promise<BoingMintSubmitResult>;
};

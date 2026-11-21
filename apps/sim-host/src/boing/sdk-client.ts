/**
 * Live Boing NFT client. Wraps @boing-network/boing-sdk's existing reference
 * NFT collection deploy + mint_batch path, plus reference multi-token for
 * compressed / fungible-like items — no parallel contract style.
 */
import {
  BOING_TESTNET_CHAIN_ID_DECIMAL,
  buildReferenceMultiTokenDeployMetaTx,
  buildReferenceNftCollectionDeployMetaTx,
  bytesToHex,
  createClient,
  encodeMultiTokenMintCalldata,
  encodeReferenceMintBatchCalldata,
  ensure0xHex,
  hexToBytes,
  multiTokenItemIdWord,
  referenceNftTokenIdWordFromU64,
  senderHexFromSecretKey,
  fetchNextNonce,
  submitContractCallWithSimulationRetry,
  type BoingClient,
} from "@boing-network/boing-sdk";
import type { BoingNftConfig } from "./config";
import { waitForNonceAfter } from "./serial-queue";
import { AssetMintClass } from "./taxonomy";
import type {
  BoingCollectionDeployPlan,
  BoingCompressedItemMintPlan,
  BoingMintBatchPlan,
  BoingMintSubmitResult,
  BoingNftClient,
  BoingNftProbeResult,
} from "./types";

const ZERO_HASH_HEX =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

export class SdkBoingNftClient implements BoingNftClient {
  readonly enabled = true;
  private readonly rpc: BoingClient;

  constructor(readonly config: BoingNftConfig) {
    this.rpc = createClient({
      baseUrl: config.rpcUrl,
      maxRetries: 3,
    });
  }

  async probe(): Promise<BoingNftProbeResult> {
    const height = await this.rpc.chainHeight();
    return {
      rpcUrl: this.config.rpcUrl,
      chainHeight: Number(height),
      chainIdDecimal: this.config.chainIdDecimal,
      templateArtifactId: this.config.templateArtifactId,
      templateVersion: this.config.templateVersion,
    };
  }

  planCollectionDeploy(): BoingCollectionDeployPlan {
    const deployMeta = buildReferenceNftCollectionDeployMetaTx({
      collectionName: this.config.collectionName,
      collectionSymbol: this.config.collectionSymbol,
      purposeCategory: "nft",
    });
    return {
      deployMeta,
      templateArtifactId: this.config.templateArtifactId,
      templateVersion: this.config.templateVersion,
      tokenClass: AssetMintClass.UNIQUE_CREATURE,
    };
  }

  planArtifactCollectionDeploy(): BoingCollectionDeployPlan {
    const deployMeta = buildReferenceNftCollectionDeployMetaTx({
      collectionName: this.config.artifactCollectionName,
      collectionSymbol: this.config.artifactCollectionSymbol,
      purposeCategory: "nft",
    });
    return {
      deployMeta,
      templateArtifactId: this.config.templateArtifactId,
      templateVersion: this.config.templateVersion,
      tokenClass: AssetMintClass.UNIQUE_LINEAGE_ARTIFACT,
    };
  }

  planItemCollectionDeploy(): BoingCollectionDeployPlan {
    const deployMeta = buildReferenceMultiTokenDeployMetaTx({
      name: this.config.itemCollectionName,
      symbol: this.config.itemCollectionSymbol,
    });
    return {
      deployMeta,
      templateArtifactId: this.config.itemTemplateArtifactId,
      templateVersion: this.config.itemTemplateVersion,
      tokenClass: AssetMintClass.COMPRESSED_ITEM,
    };
  }

  planCreatureMint(input: {
    collectionHex: string;
    toHex: string;
    creatureId: number;
    metadataHashHex?: string | null;
  }): BoingMintBatchPlan {
    if (!Number.isInteger(input.creatureId) || input.creatureId < 1) {
      throw new Error("creatureId must be a positive integer");
    }
    return this.#planUniqueMint({
      collectionHex: input.collectionHex,
      toHex: input.toHex,
      tokenSerial: input.creatureId,
      metadataHashHex: input.metadataHashHex,
      tokenClass: AssetMintClass.UNIQUE_CREATURE,
    });
  }

  planLineageArtifactMint(input: {
    collectionHex: string;
    toHex: string;
    tokenSerial: number;
    metadataHashHex?: string | null;
  }): BoingMintBatchPlan {
    if (!Number.isInteger(input.tokenSerial) || input.tokenSerial < 1) {
      throw new Error("tokenSerial must be a positive integer");
    }
    return this.#planUniqueMint({
      collectionHex: input.collectionHex,
      toHex: input.toHex,
      tokenSerial: input.tokenSerial,
      metadataHashHex: input.metadataHashHex,
      tokenClass: AssetMintClass.UNIQUE_LINEAGE_ARTIFACT,
    });
  }

  planCompressedItemMint(input: {
    collectionHex: string;
    toHex: string;
    itemKindId: number;
    amount: number;
  }): BoingCompressedItemMintPlan {
    if (!Number.isInteger(input.itemKindId) || input.itemKindId < 0) {
      throw new Error("itemKindId must be a non-negative integer");
    }
    if (!Number.isInteger(input.amount) || input.amount < 1) {
      throw new Error("amount must be a positive integer");
    }
    const tokenIdHex = multiTokenItemIdWord(input.itemKindId);
    const calldataBytes = encodeMultiTokenMintCalldata(
      ensure0xHex(input.toHex),
      input.itemKindId,
      input.amount,
    );
    return {
      collectionHex: ensure0xHex(input.collectionHex),
      toHex: ensure0xHex(input.toHex),
      itemKindId: input.itemKindId,
      amount: input.amount,
      tokenIdHex,
      calldataHex: bytesToHex(calldataBytes),
      calldataBytes,
      tokenClass: AssetMintClass.COMPRESSED_ITEM,
    };
  }

  async submitCreatureMint(
    plan: BoingMintBatchPlan,
  ): Promise<BoingMintSubmitResult> {
    return this.#submitCall(
      plan.collectionHex,
      plan.calldataBytes,
      plan.tokenIdHex,
    );
  }

  async submitLineageArtifactMint(
    plan: BoingMintBatchPlan,
  ): Promise<BoingMintSubmitResult> {
    return this.#submitCall(
      plan.collectionHex,
      plan.calldataBytes,
      plan.tokenIdHex,
    );
  }

  async submitCompressedItemMint(
    plan: BoingCompressedItemMintPlan,
  ): Promise<BoingMintSubmitResult> {
    return this.#submitCall(
      plan.collectionHex,
      plan.calldataBytes,
      plan.tokenIdHex,
    );
  }

  #planUniqueMint(input: {
    collectionHex: string;
    toHex: string;
    tokenSerial: number;
    metadataHashHex?: string | null;
    tokenClass:
      | typeof AssetMintClass.UNIQUE_CREATURE
      | typeof AssetMintClass.UNIQUE_LINEAGE_ARTIFACT;
  }): BoingMintBatchPlan {
    const tokenIdHex = referenceNftTokenIdWordFromU64(input.tokenSerial);
    const metadata =
      input.metadataHashHex != null && input.metadataHashHex.trim() !== ""
        ? ensure0xHex(input.metadataHashHex)
        : ZERO_HASH_HEX;
    const calldataBytes = encodeReferenceMintBatchCalldata(
      ensure0xHex(input.toHex),
      [tokenIdHex],
      [metadata],
    );
    return {
      collectionHex: ensure0xHex(input.collectionHex),
      toHex: ensure0xHex(input.toHex),
      tokenIdHex,
      calldataHex: bytesToHex(calldataBytes),
      calldataBytes,
      tokenClass: input.tokenClass,
    };
  }

  async #submitCall(
    collectionHex: string,
    calldataBytes: Uint8Array,
    tokenIdHex: string,
  ): Promise<BoingMintSubmitResult> {
    const secretHex = this.config.secretHex;
    if (secretHex == null) {
      throw new Error("BOING_SECRET_HEX required to submit mint");
    }
    const secretKey32 = hexToBytes(ensure0xHex(secretHex));
    if (secretKey32.length !== 32) {
      throw new Error("BOING_SECRET_HEX must be 32 bytes");
    }
    const senderHex = await senderHexFromSecretKey(secretKey32);
    const usedNonce = await fetchNextNonce(this.rpc, senderHex);
    const result = await submitContractCallWithSimulationRetry({
      client: this.rpc,
      secretKey32,
      senderHex,
      contractHex: collectionHex,
      calldata: calldataBytes,
    });
    // The SDK reads the committed nonce, which ignores pending txs. Hold the
    // (serial) mint queue until this one is included so the next mint does
    // not sign with the same nonce.
    await waitForNonceAfter(
      () => fetchNextNonce(this.rpc, senderHex),
      usedNonce,
    );
    return {
      txHash: result.tx_hash,
      collectionHex,
      tokenIdHex,
    };
  }
}

/** Re-export chain id for callers that need the constant without importing the SDK. */
export const BOING_TESTNET_CHAIN_ID = BOING_TESTNET_CHAIN_ID_DECIMAL;

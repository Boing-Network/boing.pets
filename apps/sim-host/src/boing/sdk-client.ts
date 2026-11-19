/**
 * Live Boing NFT client. Wraps @boing-network/boing-sdk's existing reference
 * NFT collection deploy + mint_batch path — no parallel contract style.
 */
import {
  BOING_TESTNET_CHAIN_ID_DECIMAL,
  buildReferenceNftCollectionDeployMetaTx,
  bytesToHex,
  createClient,
  encodeReferenceMintBatchCalldata,
  ensure0xHex,
  hexToBytes,
  referenceNftTokenIdWordFromU64,
  senderHexFromSecretKey,
  submitContractCallWithSimulationRetry,
  type BoingClient,
} from "@boing-network/boing-sdk";
import type { BoingNftConfig } from "./config";
import type {
  BoingCollectionDeployPlan,
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
    // Reference NFT: sequential token id as u64 in the low 8 bytes of a 32-byte word.
    // Living Pets uses creatureId as that sequential id (idempotent with birth).
    const tokenIdHex = referenceNftTokenIdWordFromU64(input.creatureId);
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
    };
  }

  async submitCreatureMint(
    plan: BoingMintBatchPlan,
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
    const result = await submitContractCallWithSimulationRetry({
      client: this.rpc,
      secretKey32,
      senderHex,
      contractHex: plan.collectionHex,
      calldata: plan.calldataBytes,
    });
    return {
      txHash: result.tx_hash,
      collectionHex: plan.collectionHex,
      tokenIdHex: plan.tokenIdHex,
    };
  }
}

/** Re-export chain id for callers that need the constant without importing the SDK. */
export const BOING_TESTNET_CHAIN_ID = BOING_TESTNET_CHAIN_ID_DECIMAL;

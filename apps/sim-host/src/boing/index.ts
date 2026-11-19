/**
 * Boing Network NFT client at the host edge (roadmap M19).
 *
 * Reuses @boing-network/boing-sdk reference NFT collection deploy + mint_batch.
 * packages/sim must never import this module.
 */
export {
  createDisabledBoingNftConfig,
  DEFAULT_BOING_RPC_URL,
  LIVING_PETS_COLLECTION_NAME,
  LIVING_PETS_COLLECTION_SYMBOL,
  readBoingNftConfig,
  type BoingNftConfig,
} from "./config";
export { DisabledBoingNftClient } from "./disabled-client";
export {
  createBoingNftClient,
  createDisabledMintEdge,
  createMintEdgeFromEnv,
} from "./factory";
export {
  createMintEdge,
  type MintEdge,
  type QueuedCreatureMint,
} from "./mint-edge";
export { BOING_TESTNET_CHAIN_ID, SdkBoingNftClient } from "./sdk-client";
export type {
  BoingCollectionDeployPlan,
  BoingMintBatchPlan,
  BoingMintSubmitResult,
  BoingNftClient,
  BoingNftProbeResult,
  CreatureMintJob,
} from "./types";

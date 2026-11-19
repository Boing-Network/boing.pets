/**
 * Host-edge Boing NFT config. Minting is off by default so local/dev play
 * stays offline-safe. Enabling talks to Boing testnet via @boing-network/boing-sdk.
 */
import {
  BOING_TESTNET_CHAIN_ID_DECIMAL,
  REFERENCE_NFT_COLLECTION_TEMPLATE_ARTIFACT_ID,
  REFERENCE_NFT_COLLECTION_TEMPLATE_VERSION,
} from "@boing-network/boing-sdk";

export const DEFAULT_BOING_RPC_URL = "https://testnet-rpc.boing.network/";

/** Living Pets creature collection labels for Boing QA / wallet display. */
export const LIVING_PETS_COLLECTION_NAME = "Living Pets Creatures";
export const LIVING_PETS_COLLECTION_SYMBOL = "LPET";

export type BoingNftConfig = {
  /** When false, the host never touches the network. Default. */
  enabled: boolean;
  rpcUrl: string;
  chainIdDecimal: number;
  /** Optional already-deployed reference NFT collection AccountId (0x + 64 hex). */
  collectionHex: string | null;
  /**
   * 32-byte Ed25519 seed as 0x-hex. Required only when minting/deploying.
   * Never commit a real value.
   */
  secretHex: string | null;
  collectionName: string;
  collectionSymbol: string;
  /** Boing canonical NFT template identity (existing deployment system). */
  templateArtifactId: typeof REFERENCE_NFT_COLLECTION_TEMPLATE_ARTIFACT_ID;
  templateVersion: typeof REFERENCE_NFT_COLLECTION_TEMPLATE_VERSION;
};

function envTruthy(value: string | undefined): boolean {
  if (value == null) return false;
  const v = value.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function trimOrNull(value: string | undefined): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

/**
 * Read mint-edge config from env.
 *
 * - `LIVING_PETS_BOING_MINTING` — enable (default off)
 * - `BOING_RPC_URL` — RPC (default public testnet)
 * - `LIVING_PETS_BOING_NFT_COLLECTION_HEX` — existing collection AccountId
 * - `BOING_SECRET_HEX` — signing seed when enabled ops need submit
 */
export function readBoingNftConfig(
  env: NodeJS.ProcessEnv = process.env,
): BoingNftConfig {
  return {
    enabled: envTruthy(env.LIVING_PETS_BOING_MINTING),
    rpcUrl: trimOrNull(env.BOING_RPC_URL) ?? DEFAULT_BOING_RPC_URL,
    chainIdDecimal: BOING_TESTNET_CHAIN_ID_DECIMAL,
    collectionHex: trimOrNull(env.LIVING_PETS_BOING_NFT_COLLECTION_HEX),
    secretHex: trimOrNull(env.BOING_SECRET_HEX),
    collectionName:
      trimOrNull(env.LIVING_PETS_BOING_NFT_COLLECTION_NAME) ??
      LIVING_PETS_COLLECTION_NAME,
    collectionSymbol:
      trimOrNull(env.LIVING_PETS_BOING_NFT_COLLECTION_SYMBOL) ??
      LIVING_PETS_COLLECTION_SYMBOL,
    templateArtifactId: REFERENCE_NFT_COLLECTION_TEMPLATE_ARTIFACT_ID,
    templateVersion: REFERENCE_NFT_COLLECTION_TEMPLATE_VERSION,
  };
}

export function createDisabledBoingNftConfig(): BoingNftConfig {
  return {
    enabled: false,
    rpcUrl: DEFAULT_BOING_RPC_URL,
    chainIdDecimal: BOING_TESTNET_CHAIN_ID_DECIMAL,
    collectionHex: null,
    secretHex: null,
    collectionName: LIVING_PETS_COLLECTION_NAME,
    collectionSymbol: LIVING_PETS_COLLECTION_SYMBOL,
    templateArtifactId: REFERENCE_NFT_COLLECTION_TEMPLATE_ARTIFACT_ID,
    templateVersion: REFERENCE_NFT_COLLECTION_TEMPLATE_VERSION,
  };
}

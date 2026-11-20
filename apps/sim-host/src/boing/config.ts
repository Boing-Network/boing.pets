/**
 * Host-edge Boing NFT config. Minting is off by default so local/dev play
 * stays offline-safe. Enabling talks to Boing testnet via @boing-network/boing-sdk.
 */
import {
  BOING_TESTNET_CHAIN_ID_DECIMAL,
  REFERENCE_MULTI_TOKEN_ARTIFACT_ID,
  REFERENCE_MULTI_TOKEN_TEMPLATE_VERSION,
  REFERENCE_NFT_COLLECTION_TEMPLATE_ARTIFACT_ID,
  REFERENCE_NFT_COLLECTION_TEMPLATE_VERSION,
} from "@boing-network/boing-sdk";

export const DEFAULT_BOING_RPC_URL = "https://testnet-rpc.boing.network/";

/** Living Pets creature collection labels for Boing QA / wallet display. */
export const LIVING_PETS_COLLECTION_NAME = "Living Pets Creatures";
export const LIVING_PETS_COLLECTION_SYMBOL = "LPET";

/** Distinct collection labels for unique lineage/story artifacts (M21). */
export const LIVING_PETS_ARTIFACT_COLLECTION_NAME =
  "Living Pets Lineage Artifacts";
export const LIVING_PETS_ARTIFACT_COLLECTION_SYMBOL = "LPAR";

/** Compressed / fungible-like item multi-token labels (M21). */
export const LIVING_PETS_ITEM_COLLECTION_NAME = "Living Pets Items";
export const LIVING_PETS_ITEM_COLLECTION_SYMBOL = "LPIT";

export type BoingNftConfig = {
  /** When false, the host never touches the network. Default. */
  enabled: boolean;
  rpcUrl: string;
  chainIdDecimal: number;
  /** Optional already-deployed reference NFT collection AccountId (0x + 64 hex). */
  collectionHex: string | null;
  /**
   * Distinct reference NFT collection for UNIQUE_LINEAGE_ARTIFACT.
   * Falls back to `collectionHex` when unset (still a distinct token class).
   */
  artifactCollectionHex: string | null;
  /**
   * Reference multi-token collection for COMPRESSED_ITEM (potions / gear).
   */
  itemCollectionHex: string | null;
  /**
   * 32-byte Ed25519 seed as 0x-hex. Required only when minting/deploying.
   * Never commit a real value.
   */
  secretHex: string | null;
  /**
   * Optional mint recipient AccountId (0x + 64 hex). When null, submit derives
   * the sender address from `secretHex`.
   */
  recipientHex: string | null;
  collectionName: string;
  collectionSymbol: string;
  artifactCollectionName: string;
  artifactCollectionSymbol: string;
  itemCollectionName: string;
  itemCollectionSymbol: string;
  /** Boing canonical NFT template identity (existing deployment system). */
  templateArtifactId: typeof REFERENCE_NFT_COLLECTION_TEMPLATE_ARTIFACT_ID;
  templateVersion: typeof REFERENCE_NFT_COLLECTION_TEMPLATE_VERSION;
  itemTemplateArtifactId: typeof REFERENCE_MULTI_TOKEN_ARTIFACT_ID;
  itemTemplateVersion: typeof REFERENCE_MULTI_TOKEN_TEMPLATE_VERSION;
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
 * - `LIVING_PETS_BOING_NFT_COLLECTION_HEX` — creature collection AccountId
 * - `LIVING_PETS_BOING_ARTIFACT_COLLECTION_HEX` — lineage artifact collection
 * - `LIVING_PETS_BOING_ITEM_COLLECTION_HEX` — compressed item multi-token
 * - `LIVING_PETS_BOING_NFT_RECIPIENT_HEX` — mint recipient (else derived from secret)
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
    artifactCollectionHex: trimOrNull(
      env.LIVING_PETS_BOING_ARTIFACT_COLLECTION_HEX,
    ),
    itemCollectionHex: trimOrNull(env.LIVING_PETS_BOING_ITEM_COLLECTION_HEX),
    secretHex: trimOrNull(env.BOING_SECRET_HEX),
    recipientHex: trimOrNull(env.LIVING_PETS_BOING_NFT_RECIPIENT_HEX),
    collectionName:
      trimOrNull(env.LIVING_PETS_BOING_NFT_COLLECTION_NAME) ??
      LIVING_PETS_COLLECTION_NAME,
    collectionSymbol:
      trimOrNull(env.LIVING_PETS_BOING_NFT_COLLECTION_SYMBOL) ??
      LIVING_PETS_COLLECTION_SYMBOL,
    artifactCollectionName:
      trimOrNull(env.LIVING_PETS_BOING_ARTIFACT_COLLECTION_NAME) ??
      LIVING_PETS_ARTIFACT_COLLECTION_NAME,
    artifactCollectionSymbol:
      trimOrNull(env.LIVING_PETS_BOING_ARTIFACT_COLLECTION_SYMBOL) ??
      LIVING_PETS_ARTIFACT_COLLECTION_SYMBOL,
    itemCollectionName:
      trimOrNull(env.LIVING_PETS_BOING_ITEM_COLLECTION_NAME) ??
      LIVING_PETS_ITEM_COLLECTION_NAME,
    itemCollectionSymbol:
      trimOrNull(env.LIVING_PETS_BOING_ITEM_COLLECTION_SYMBOL) ??
      LIVING_PETS_ITEM_COLLECTION_SYMBOL,
    templateArtifactId: REFERENCE_NFT_COLLECTION_TEMPLATE_ARTIFACT_ID,
    templateVersion: REFERENCE_NFT_COLLECTION_TEMPLATE_VERSION,
    itemTemplateArtifactId: REFERENCE_MULTI_TOKEN_ARTIFACT_ID,
    itemTemplateVersion: REFERENCE_MULTI_TOKEN_TEMPLATE_VERSION,
  };
}

export function createDisabledBoingNftConfig(): BoingNftConfig {
  return {
    enabled: false,
    rpcUrl: DEFAULT_BOING_RPC_URL,
    chainIdDecimal: BOING_TESTNET_CHAIN_ID_DECIMAL,
    collectionHex: null,
    artifactCollectionHex: null,
    itemCollectionHex: null,
    secretHex: null,
    recipientHex: null,
    collectionName: LIVING_PETS_COLLECTION_NAME,
    collectionSymbol: LIVING_PETS_COLLECTION_SYMBOL,
    artifactCollectionName: LIVING_PETS_ARTIFACT_COLLECTION_NAME,
    artifactCollectionSymbol: LIVING_PETS_ARTIFACT_COLLECTION_SYMBOL,
    itemCollectionName: LIVING_PETS_ITEM_COLLECTION_NAME,
    itemCollectionSymbol: LIVING_PETS_ITEM_COLLECTION_SYMBOL,
    templateArtifactId: REFERENCE_NFT_COLLECTION_TEMPLATE_ARTIFACT_ID,
    templateVersion: REFERENCE_NFT_COLLECTION_TEMPLATE_VERSION,
    itemTemplateArtifactId: REFERENCE_MULTI_TOKEN_ARTIFACT_ID,
    itemTemplateVersion: REFERENCE_MULTI_TOKEN_TEMPLATE_VERSION,
  };
}

/** Resolve artifact collection: explicit env, else creature collection. */
export function resolveArtifactCollectionHex(
  config: BoingNftConfig,
): string | null {
  return config.artifactCollectionHex ?? config.collectionHex;
}

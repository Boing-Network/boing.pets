/**
 * M21 asset mint taxonomy (host edge only).
 *
 * Product law: unique lineage/story artifacts → unique NFTs; potions and
 * interchangeable items → Boing compressed NFTs (reference multi-token,
 * fungible-like). Creatures remain UNIQUE_CREATURE (M20). Never imported by
 * packages/sim or called from step().
 */
import {
  REFERENCE_MULTI_TOKEN_ARTIFACT_ID,
  REFERENCE_MULTI_TOKEN_TEMPLATE_VERSION,
  REFERENCE_NFT_COLLECTION_TEMPLATE_ARTIFACT_ID,
  REFERENCE_NFT_COLLECTION_TEMPLATE_VERSION,
} from "@boing-network/boing-sdk";

export const AssetMintClass = {
  /** Every creature at birth — reference NFT collection (M20). */
  UNIQUE_CREATURE: "UNIQUE_CREATURE",
  /** Named lineage keepsakes, first-child / grief commemoratives — unique NFT. */
  UNIQUE_LINEAGE_ARTIFACT: "UNIQUE_LINEAGE_ARTIFACT",
  /** Potions / stackable gear — Boing reference multi-token (compressed / fungible-like). */
  COMPRESSED_ITEM: "COMPRESSED_ITEM",
} as const;

export type AssetMintClass =
  (typeof AssetMintClass)[keyof typeof AssetMintClass];

/**
 * Classes stored on `asset_mint_link` (creatures stay on `creature_nft_link`).
 */
export type PersistedAssetMintClass =
  | typeof AssetMintClass.UNIQUE_LINEAGE_ARTIFACT
  | typeof AssetMintClass.COMPRESSED_ITEM;

export const ALL_ASSET_MINT_CLASSES: readonly AssetMintClass[] = [
  AssetMintClass.UNIQUE_CREATURE,
  AssetMintClass.UNIQUE_LINEAGE_ARTIFACT,
  AssetMintClass.COMPRESSED_ITEM,
];

export const PERSISTED_ASSET_MINT_CLASSES: readonly PersistedAssetMintClass[] =
  [AssetMintClass.UNIQUE_LINEAGE_ARTIFACT, AssetMintClass.COMPRESSED_ITEM];

/** How the asset is shaped on Boing’s existing deployment system. */
export const TokenShape = {
  UNIQUE_NFT: "UNIQUE_NFT",
  COMPRESSED_FUNGIBLE: "COMPRESSED_FUNGIBLE",
} as const;

export type TokenShape = (typeof TokenShape)[keyof typeof TokenShape];

export type AssetMintClassProfile = {
  tokenClass: AssetMintClass;
  tokenShape: TokenShape;
  /** Canonical Boing template artifact id. */
  templateArtifactId: string;
  templateVersion: string;
  /** Express / wallet purpose_category for collection deploy. */
  purposeCategory: "nft";
  description: string;
};

/**
 * Closed catalog of mint classes. Inventory/crafting stay out of the sim
 * foundation; when they arrive they pick a row from this table.
 */
export const ASSET_MINT_CLASS_PROFILES: Record<
  AssetMintClass,
  AssetMintClassProfile
> = {
  [AssetMintClass.UNIQUE_CREATURE]: {
    tokenClass: AssetMintClass.UNIQUE_CREATURE,
    tokenShape: TokenShape.UNIQUE_NFT,
    templateArtifactId: REFERENCE_NFT_COLLECTION_TEMPLATE_ARTIFACT_ID,
    templateVersion: REFERENCE_NFT_COLLECTION_TEMPLATE_VERSION,
    purposeCategory: "nft",
    description:
      "Unique creature NFT minted at birth via reference NFT mint_batch",
  },
  [AssetMintClass.UNIQUE_LINEAGE_ARTIFACT]: {
    tokenClass: AssetMintClass.UNIQUE_LINEAGE_ARTIFACT,
    tokenShape: TokenShape.UNIQUE_NFT,
    templateArtifactId: REFERENCE_NFT_COLLECTION_TEMPLATE_ARTIFACT_ID,
    templateVersion: REFERENCE_NFT_COLLECTION_TEMPLATE_VERSION,
    purposeCategory: "nft",
    description:
      "One-of-one lineage/story artifact via the same reference NFT path",
  },
  [AssetMintClass.COMPRESSED_ITEM]: {
    tokenClass: AssetMintClass.COMPRESSED_ITEM,
    tokenShape: TokenShape.COMPRESSED_FUNGIBLE,
    templateArtifactId: REFERENCE_MULTI_TOKEN_ARTIFACT_ID,
    templateVersion: REFERENCE_MULTI_TOKEN_TEMPLATE_VERSION,
    purposeCategory: "nft",
    description:
      "Interchangeable item as Boing reference multi-token (compressed / fungible-like)",
  },
};

export function profileForAssetMintClass(
  tokenClass: AssetMintClass,
): AssetMintClassProfile {
  return ASSET_MINT_CLASS_PROFILES[tokenClass];
}

/** Story artifact kinds the host may mint as UNIQUE_LINEAGE_ARTIFACT. */
export const LineageArtifactKind = {
  LINEAGE_KEEPSAKE: "LINEAGE_KEEPSAKE",
  FIRST_CHILD_COMMEMORATIVE: "FIRST_CHILD_COMMEMORATIVE",
  GRIEF_COMMEMORATIVE: "GRIEF_COMMEMORATIVE",
} as const;

export type LineageArtifactKind =
  (typeof LineageArtifactKind)[keyof typeof LineageArtifactKind];

/**
 * Known interchangeable item kinds (compressed multi-token item ids).
 * Amounts are minted at the host edge when inventory systems arrive; M21 only
 * registers the taxonomy + mint hooks.
 */
export const CompressedItemKind = {
  POTION_VITALITY: {
    itemKindId: 1,
    slug: "potion.vitality",
    displayName: "Vitality Potion",
  },
  POTION_CALM: {
    itemKindId: 2,
    slug: "potion.calm",
    displayName: "Calm Potion",
  },
  RATIONS_PACK: {
    itemKindId: 3,
    slug: "item.rations",
    displayName: "Rations Pack",
  },
} as const;

export type CompressedItemKindKey = keyof typeof CompressedItemKind;

export function isAssetMintClass(value: string): value is AssetMintClass {
  return (ALL_ASSET_MINT_CLASSES as readonly string[]).includes(value);
}

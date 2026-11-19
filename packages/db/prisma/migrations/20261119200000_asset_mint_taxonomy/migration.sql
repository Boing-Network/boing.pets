-- M21: asset mint taxonomy links for lineage artifacts + compressed items.
-- Outside the hot step() snapshot.

CREATE TYPE "AssetMintClass" AS ENUM ('UNIQUE_LINEAGE_ARTIFACT', 'COMPRESSED_ITEM');

CREATE TABLE "asset_mint_link" (
    "id" BIGINT NOT NULL,
    "world_id" BIGINT NOT NULL,
    "token_class" "AssetMintClass" NOT NULL,
    "mint_key" TEXT NOT NULL,
    "lineage_id" BIGINT,
    "artifact_kind" TEXT,
    "token_serial" BIGINT,
    "item_kind_id" BIGINT,
    "amount" BIGINT,
    "item_slug" TEXT,
    "collection_hex" TEXT NOT NULL,
    "token_id_hex" TEXT NOT NULL,
    "chain_id" TEXT NOT NULL,
    "template_artifact" TEXT NOT NULL,
    "template_version" TEXT NOT NULL,
    "mint_tx_hex" TEXT,
    "status" "NftMintStatus" NOT NULL,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_mint_link_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "asset_mint_link_world_id_token_class_mint_key_key"
  ON "asset_mint_link"("world_id", "token_class", "mint_key");

CREATE INDEX "asset_mint_link_world_id_status_idx"
  ON "asset_mint_link"("world_id", "status");

CREATE INDEX "asset_mint_link_token_class_status_idx"
  ON "asset_mint_link"("token_class", "status");

ALTER TABLE "asset_mint_link"
  ADD CONSTRAINT "asset_mint_link_world_id_fkey"
  FOREIGN KEY ("world_id") REFERENCES "world"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

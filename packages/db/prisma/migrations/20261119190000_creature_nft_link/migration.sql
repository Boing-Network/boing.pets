-- Host-edge creature ↔ Boing NFT link table (M19 schema-ready; M20 writes).
-- Not part of the hot step() snapshot.

CREATE TYPE "NftMintStatus" AS ENUM ('PENDING', 'SUBMITTED', 'CONFIRMED', 'FAILED');

CREATE TABLE "creature_nft_link" (
    "id" BIGINT NOT NULL,
    "world_id" BIGINT NOT NULL,
    "creature_id" BIGINT NOT NULL,
    "birth_event_id" BIGINT,
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

    CONSTRAINT "creature_nft_link_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "creature_nft_link_creature_id_key" ON "creature_nft_link"("creature_id");

CREATE UNIQUE INDEX "creature_nft_link_world_id_creature_id_key" ON "creature_nft_link"("world_id", "creature_id");

CREATE UNIQUE INDEX "creature_nft_link_collection_hex_token_id_hex_key" ON "creature_nft_link"("collection_hex", "token_id_hex");

CREATE INDEX "creature_nft_link_world_id_status_idx" ON "creature_nft_link"("world_id", "status");

ALTER TABLE "creature_nft_link" ADD CONSTRAINT "creature_nft_link_world_id_fkey" FOREIGN KEY ("world_id") REFERENCES "world"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "creature_nft_link" ADD CONSTRAINT "creature_nft_link_creature_id_fkey" FOREIGN KEY ("creature_id") REFERENCES "creature"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

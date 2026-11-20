-- Genesis flag on creature NFT links: true for the founders minted as the
-- genesis set. Existing rows default to false.

ALTER TABLE "creature_nft_link" ADD COLUMN "genesis" BOOLEAN NOT NULL DEFAULT false;

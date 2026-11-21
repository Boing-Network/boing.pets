-- Creature autonomy and mint on demand.
-- Additive and idempotent: new enum values, one new column with a default,
-- one new table. Existing rows and the live world are untouched apart from
-- marking already-on-chain inventory lots as minted (an idempotent backfill).

-- Creature activity events and host-issued creature influences.
ALTER TYPE "EventKind" ADD VALUE IF NOT EXISTS 'ITEM';
ALTER TYPE "InfluenceKind" ADD VALUE IF NOT EXISTS 'CREATURE_USE_ITEM';
ALTER TYPE "InfluenceKind" ADD VALUE IF NOT EXISTS 'CREATURE_CRAFT';

-- Minted lots: units that exist as LPIT on chain.
ALTER TABLE "inventory_lot" ADD COLUMN IF NOT EXISTS "minted" BOOLEAN NOT NULL DEFAULT false;
-- Lots that already mirror on-chain units: reward mints (mint:), item escrow
-- locks, fills and returns (ilist:, ibuy:, iret:), and the one-off LPIT
-- trade-test fixture (test:lpit-trade:). Re-running sets nothing new.
UPDATE "inventory_lot"
SET "minted" = true
WHERE "minted" = false
  AND (
    "source_key" LIKE 'mint:%'
    OR "source_key" LIKE 'ilist:%'
    OR "source_key" LIKE 'ibuy:%'
    OR "source_key" LIKE 'iret:%'
    OR "source_key" LIKE 'test:lpit-trade:%'
  );

-- Per keeper autonomy toggles (no row: both on).
CREATE TABLE IF NOT EXISTS "item_autonomy" (
    "world_id" BIGINT NOT NULL,
    "account_id" TEXT NOT NULL,
    "auto_craft" BOOLEAN NOT NULL DEFAULT true,
    "auto_use" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "item_autonomy_pkey" PRIMARY KEY ("world_id", "account_id")
);
DO $$ BEGIN
  ALTER TABLE "item_autonomy" ADD CONSTRAINT "item_autonomy_world_id_fkey" FOREIGN KEY ("world_id") REFERENCES "world"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- M22 item slice, part 2: off-chain inventory and influence accounts.
-- Additive and idempotent: new tables only; nothing existing is altered.
CREATE TABLE IF NOT EXISTS "inventory_lot" (
    "id" BIGINT NOT NULL,
    "world_id" BIGINT NOT NULL,
    "account_id" TEXT NOT NULL,
    "source_key" TEXT NOT NULL,
    "item_slug" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "remaining" INTEGER NOT NULL,
    "gained_tick" BIGINT NOT NULL,
    "spoils_at_tick" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "inventory_lot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "inventory_lot_remaining_range" CHECK ("remaining" >= 0 AND "remaining" <= "amount")
);
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_lot_world_id_source_key_key" ON "inventory_lot"("world_id", "source_key");
CREATE INDEX IF NOT EXISTS "inventory_lot_world_id_account_id_idx" ON "inventory_lot"("world_id", "account_id");

CREATE TABLE IF NOT EXISTS "influence_account" (
    "influence_id" BIGINT NOT NULL,
    "world_id" BIGINT NOT NULL,
    "account_id" TEXT NOT NULL,
    "kind" "InfluenceKind" NOT NULL,
    "lineage_id" BIGINT,
    "territory_id" BIGINT,
    "item_slug" TEXT,
    "accepted_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "influence_account_pkey" PRIMARY KEY ("influence_id")
);
CREATE INDEX IF NOT EXISTS "influence_account_world_id_account_id_idx" ON "influence_account"("world_id", "account_id");
CREATE INDEX IF NOT EXISTS "influence_account_world_id_kind_lineage_id_idx" ON "influence_account"("world_id", "kind", "lineage_id");

DO $$ BEGIN
  ALTER TABLE "inventory_lot" ADD CONSTRAINT "inventory_lot_world_id_fkey" FOREIGN KEY ("world_id") REFERENCES "world"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "influence_account" ADD CONSTRAINT "influence_account_world_id_fkey" FOREIGN KEY ("world_id") REFERENCES "world"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

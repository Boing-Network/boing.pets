-- Schema version 2: authoritative creature positions (territory-local permille).
-- Existing rows default to 0; the host re-places version-1 worlds
-- deterministically on load and rewrites them as version 2.
ALTER TABLE "creature" ADD COLUMN "spot_x" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "creature" ADD COLUMN "spot_z" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "creature" ADD COLUMN "from_spot_x" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "creature" ADD COLUMN "from_spot_z" INTEGER NOT NULL DEFAULT 0;

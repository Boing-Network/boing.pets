-- M22 item slice, part 1: new influence verbs and modifier kinds.
-- Additive and idempotent: existing rows and the live world are untouched.
ALTER TYPE "InfluenceKind" ADD VALUE IF NOT EXISTS 'GATHER_RESOURCE';
ALTER TYPE "InfluenceKind" ADD VALUE IF NOT EXISTS 'USE_ITEM';
ALTER TYPE "ModifierKind" ADD VALUE IF NOT EXISTS 'HARVEST';
ALTER TYPE "ModifierKind" ADD VALUE IF NOT EXISTS 'COMFORT';

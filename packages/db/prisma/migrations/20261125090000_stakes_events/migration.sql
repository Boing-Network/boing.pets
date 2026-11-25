-- Stakes: injury and outbreak events, and the sickness territory modifier.
-- Additive and idempotent: new enum values only. Existing rows are untouched.
ALTER TYPE "EventKind" ADD VALUE IF NOT EXISTS 'INJURY';
ALTER TYPE "EventKind" ADD VALUE IF NOT EXISTS 'OUTBREAK';
ALTER TYPE "ModifierKind" ADD VALUE IF NOT EXISTS 'SICKNESS';

-- Bestiary expansion: species can be omnivores, insectivores, or carnivores.
-- Additive only: existing rows keep HERBIVORE until the host's
-- introduce-species migration refreshes the catalog diets on next boot.
ALTER TYPE "Diet" ADD VALUE IF NOT EXISTS 'OMNIVORE';
ALTER TYPE "Diet" ADD VALUE IF NOT EXISTS 'INSECTIVORE';
ALTER TYPE "Diet" ADD VALUE IF NOT EXISTS 'CARNIVORE';

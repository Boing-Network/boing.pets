-- Equipped cosmetics per pet (one item per slot). Ownership is checked at write time.
CREATE TABLE IF NOT EXISTS pet_cosmetics (
  owner TEXT NOT NULL,
  slot TEXT NOT NULL,
  item_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (owner, slot)
);
CREATE INDEX IF NOT EXISTS idx_pet_cosmetics_item ON pet_cosmetics(item_id);

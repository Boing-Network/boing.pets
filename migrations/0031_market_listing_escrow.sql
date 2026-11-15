-- Listing cutover. Apply locally or in tests only until a deploy is approved.
-- Rows already open keep escrow='inventory' so cancel, expiry, and sale
-- still credit `inventory`. New listings set escrow='minted' and move
-- `item_mint_balance` only. Do not copy `inventory` into that table.

ALTER TABLE marketplace_listings
  ADD COLUMN escrow TEXT NOT NULL DEFAULT 'inventory'
  CHECK (escrow IN ('inventory', 'minted'));

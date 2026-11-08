-- Phase 4: soft-currency ledger, inventory, and marketplace escrow foundation.
-- Cosmetics-only economy; no pay-to-win fields.

CREATE TABLE IF NOT EXISTS economy_challenges (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('claim','buy_catalog','list','buy_listing','cancel_listing')),
  payload TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX economy_challenges_owner ON economy_challenges(owner, created_at);
CREATE INDEX economy_challenges_expiry ON economy_challenges(expires_at);

CREATE TABLE IF NOT EXISTS ledger (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  currency TEXT NOT NULL CHECK(currency IN ('boinglets','sparkles')),
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  ref TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX ledger_owner_time ON ledger(owner, created_at);
CREATE INDEX ledger_owner_currency ON ledger(owner, currency);

CREATE TABLE IF NOT EXISTS inventory (
  owner TEXT NOT NULL,
  item_id TEXT NOT NULL,
  qty INTEGER NOT NULL CHECK(qty >= 0),
  PRIMARY KEY (owner, item_id)
);

CREATE TABLE IF NOT EXISTS marketplace_listings (
  id TEXT PRIMARY KEY,
  seller TEXT NOT NULL,
  item_id TEXT NOT NULL,
  qty INTEGER NOT NULL CHECK(qty > 0),
  price_boinglets INTEGER NOT NULL CHECK(price_boinglets > 0),
  status TEXT NOT NULL CHECK(status IN ('open','sold','cancelled')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX marketplace_open ON marketplace_listings(status, created_at DESC);
CREATE INDEX marketplace_seller ON marketplace_listings(seller, status);

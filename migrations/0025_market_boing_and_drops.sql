-- Player market priced in testnet BOING, plus the cosmetic drop table.
-- Design: docs/MARKET-AND-DROPS-PLAN.md. Do not apply remotely until approved.

CREATE TABLE IF NOT EXISTS marketplace_listings_v2 (
  id TEXT PRIMARY KEY,
  seller TEXT NOT NULL,
  item_id TEXT NOT NULL,
  qty INTEGER NOT NULL CHECK(qty > 0),
  price_boinglets INTEGER,
  price_boing TEXT,
  status TEXT NOT NULL CHECK(status IN ('open','sold','cancelled','expired')),
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
INSERT INTO marketplace_listings_v2(
  id,seller,item_id,qty,price_boinglets,price_boing,status,expires_at,created_at,updated_at
)
SELECT id,seller,item_id,qty,price_boinglets,NULL,status,NULL,created_at,updated_at
FROM marketplace_listings;
DROP TABLE marketplace_listings;
ALTER TABLE marketplace_listings_v2 RENAME TO marketplace_listings;
CREATE INDEX IF NOT EXISTS marketplace_open ON marketplace_listings(status, created_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_seller ON marketplace_listings(seller, status);
CREATE INDEX IF NOT EXISTS marketplace_expiry ON marketplace_listings(status, expires_at);

CREATE TABLE IF NOT EXISTS inventory_acquisitions (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  item_id TEXT NOT NULL,
  qty INTEGER NOT NULL CHECK(qty > 0),
  source TEXT NOT NULL,
  from_owner TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS inventory_acquisitions_owner
  ON inventory_acquisitions(owner, item_id, created_at DESC);

CREATE TABLE IF NOT EXISTS drop_rolls (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  source TEXT NOT NULL,
  utc_day TEXT NOT NULL,
  nonce TEXT NOT NULL,
  digest_hex TEXT NOT NULL,
  table_version TEXT NOT NULL,
  hit INTEGER NOT NULL CHECK(hit IN (0,1)),
  reason TEXT NOT NULL,
  item_id TEXT,
  item_onchain_id INTEGER,
  qty INTEGER,
  pity_rare_before INTEGER NOT NULL,
  pity_premium_before INTEGER NOT NULL,
  pity_rare_after INTEGER NOT NULL,
  pity_premium_after INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(owner, source, utc_day, nonce)
);
CREATE INDEX IF NOT EXISTS drop_rolls_owner ON drop_rolls(owner, created_at DESC);
CREATE INDEX IF NOT EXISTS drop_rolls_day ON drop_rolls(owner, utc_day);

CREATE TABLE IF NOT EXISTS drop_pity (
  owner TEXT PRIMARY KEY,
  hits_since_rare INTEGER NOT NULL DEFAULT 0,
  hits_since_premium INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS market_payments (
  tx_hash TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  buyer TEXT NOT NULL,
  seller TEXT NOT NULL,
  price_boing TEXT NOT NULL,
  fee_boing TEXT NOT NULL,
  proceeds_boing TEXT NOT NULL,
  escrow TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS market_payouts (
  id TEXT PRIMARY KEY,
  payment_tx TEXT NOT NULL,
  listing_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('seller','sink')),
  recipient TEXT NOT NULL,
  amount_boing TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','sent','failed')),
  payout_tx TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS market_payouts_status ON market_payouts(status, created_at);


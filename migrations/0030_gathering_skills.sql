-- Quarry gathering. Apply locally or in tests only until a deploy is approved.
-- No cron. Playable stacks stay in `inventory` (the bank). Mint tables are empty
-- until the vault mint phase; listings still escrow `inventory`.

CREATE TABLE IF NOT EXISTS gather_skills (
  owner TEXT NOT NULL,
  skill TEXT NOT NULL CHECK(skill IN ('quarry','line','plot','sweep')),
  xp INTEGER NOT NULL DEFAULT 0 CHECK(xp >= 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (owner, skill)
);

CREATE TABLE IF NOT EXISTS gather_sessions (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  skill TEXT NOT NULL CHECK(skill IN ('quarry','line','plot','sweep')),
  node_id TEXT NOT NULL,
  station_id TEXT NOT NULL,
  tick_ms INTEGER NOT NULL,
  deplete_ticks INTEGER NOT NULL CHECK(deplete_ticks BETWEEN 30 AND 140),
  ticks_settled INTEGER NOT NULL DEFAULT 0 CHECK(ticks_settled >= 0),
  seed TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('running','depleted','packed','stopped')),
  started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS gather_sessions_owner
  ON gather_sessions(owner, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS gather_sessions_one_live
  ON gather_sessions(owner) WHERE status = 'running';

CREATE TABLE IF NOT EXISTS gather_backpack (
  owner TEXT NOT NULL,
  item_id TEXT NOT NULL,
  qty INTEGER NOT NULL CHECK(qty > 0),
  PRIMARY KEY (owner, item_id)
);

CREATE TABLE IF NOT EXISTS gather_daily (
  owner TEXT NOT NULL,
  skill TEXT NOT NULL,
  day_key TEXT NOT NULL,
  cred_items INTEGER NOT NULL DEFAULT 0 CHECK(cred_items >= 0),
  cred_paid INTEGER NOT NULL DEFAULT 0 CHECK(cred_paid >= 0),
  PRIMARY KEY (owner, skill, day_key)
);

CREATE TABLE IF NOT EXISTS gather_bank_log (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  item_id TEXT NOT NULL,
  qty INTEGER NOT NULL CHECK(qty > 0),
  cred INTEGER NOT NULL CHECK(cred >= 0),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS gather_bank_log_owner
  ON gather_bank_log(owner, created_at DESC);

-- Future vault mint. One row is one item id and one operator leg.
-- Phase 1 does not insert these. Status moves queued -> submitted -> minted,
-- or failed, and a failure refunds qty back onto inventory (the bank).
CREATE TABLE IF NOT EXISTS gather_mint_queue (
  id TEXT PRIMARY KEY,
  client_key TEXT NOT NULL,
  owner TEXT NOT NULL,
  game_item_id TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  qty INTEGER NOT NULL CHECK(qty > 0 AND qty <= 10000),
  contract TEXT,
  admin_nonce INTEGER,
  signed_tx TEXT,
  tx_hash TEXT,
  status TEXT NOT NULL CHECK(status IN ('queued','submitted','minted','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(owner, client_key)
);
CREATE INDEX IF NOT EXISTS gather_mint_queue_status
  ON gather_mint_queue(status, updated_at);

-- On-chain qty the mint phase will let the market list. Empty in phase 1.
-- Do not backfill from `inventory`: those stacks are banked, not minted.
CREATE TABLE IF NOT EXISTS item_mint_balance (
  owner TEXT NOT NULL,
  item_id TEXT NOT NULL,
  qty INTEGER NOT NULL CHECK(qty >= 0),
  PRIMARY KEY (owner, item_id)
);

-- Idle Adventures phase 1. Apply locally only until Nico approves remote.
CREATE TABLE IF NOT EXISTS adventure_runs (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  location_id TEXT NOT NULL,
  duration_id TEXT NOT NULL,
  slot INTEGER NOT NULL,
  style_snapshot TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  completed_at INTEGER,
  outcome TEXT,
  status TEXT NOT NULL,
  claim_id TEXT UNIQUE,
  claimed_at INTEGER,
  seed INTEGER NOT NULL,
  diminishing REAL NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS adventure_runs_owner_status
  ON adventure_runs(owner, status, ends_at);
CREATE INDEX IF NOT EXISTS adventure_runs_owner_location_day
  ON adventure_runs(owner, location_id, started_at);

CREATE TABLE IF NOT EXISTS adventure_rewards (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  kind TEXT NOT NULL,
  game_item_id TEXT,
  currency TEXT,
  qty INTEGER NOT NULL,
  rarity TEXT,
  duplicate INTEGER NOT NULL DEFAULT 0,
  mint_status TEXT NOT NULL,
  mint_tx TEXT,
  mint_nonce INTEGER,
  mint_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (run_id) REFERENCES adventure_runs(id)
);
CREATE INDEX IF NOT EXISTS adventure_rewards_run ON adventure_rewards(run_id);
CREATE INDEX IF NOT EXISTS adventure_rewards_mint
  ON adventure_rewards(mint_status, updated_at);

CREATE TABLE IF NOT EXISTS adventure_pity (
  owner TEXT PRIMARY KEY,
  misses INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS adventure_milestones (
  owner TEXT PRIMARY KEY,
  completed_count INTEGER NOT NULL DEFAULT 0,
  slots INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS operator_mint_queue (
  id TEXT PRIMARY KEY,
  reward_id TEXT NOT NULL UNIQUE,
  owner TEXT NOT NULL,
  game_item_id TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  qty INTEGER NOT NULL,
  admin_nonce INTEGER,
  signed_tx TEXT,
  tx_hash TEXT,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS operator_mint_queue_status
  ON operator_mint_queue(status, updated_at);

CREATE TABLE IF NOT EXISTS adventure_reward_grants (
  reward_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

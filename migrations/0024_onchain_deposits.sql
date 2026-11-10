-- Deposits: player-signed multi-token transfer to the Pets operator, then credit inventory once.
-- Additive. Idempotent on tx_hash (one credit per included transfer).
CREATE TABLE IF NOT EXISTS onchain_deposits (
  tx_hash TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  game_item_id TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  qty INTEGER NOT NULL CHECK(qty > 0),
  contract TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS onchain_deposits_owner ON onchain_deposits(owner, created_at DESC);

CREATE TABLE IF NOT EXISTS onchain_deposit_attempts (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS onchain_deposit_attempts_owner ON onchain_deposit_attempts(owner, created_at);

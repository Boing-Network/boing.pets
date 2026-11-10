-- Optional on-chain withdrawal of mined resources into a reference multi-token contract.
-- Disabled unless MULTI_TOKEN_CONTRACT and the MULTI_TOKEN_ADMIN_SECRET_KEY secret are set.
CREATE TABLE IF NOT EXISTS onchain_withdraw_challenges (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  game_item_id TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  qty INTEGER NOT NULL CHECK(qty > 0),
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS onchain_withdraw_challenges_owner ON onchain_withdraw_challenges(owner, created_at);

CREATE TABLE IF NOT EXISTS onchain_withdrawals (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  game_item_id TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  qty INTEGER NOT NULL CHECK(qty > 0),
  contract TEXT NOT NULL,
  admin_nonce INTEGER NOT NULL,
  signed_tx TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('submitted','minted','refunded')),
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS onchain_withdrawals_owner ON onchain_withdrawals(owner, created_at DESC);
CREATE INDEX IF NOT EXISTS onchain_withdrawals_status ON onchain_withdrawals(status, updated_at);
-- One in-flight mint per operator nonce: concurrent withdrawals cannot reuse a nonce.
CREATE UNIQUE INDEX IF NOT EXISTS onchain_withdrawals_inflight_nonce
  ON onchain_withdrawals(contract, admin_nonce) WHERE status = 'submitted';

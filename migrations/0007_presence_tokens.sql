-- Wallet-bound plaza presence tokens (Phase 3).
CREATE TABLE IF NOT EXISTS presence_challenges (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  zone TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX presence_challenges_owner ON presence_challenges(owner, created_at);
CREATE INDEX presence_challenges_expiry ON presence_challenges(expires_at);

CREATE TABLE IF NOT EXISTS presence_tokens (
  token TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  zone TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX presence_tokens_owner ON presence_tokens(owner, expires_at);
CREATE INDEX presence_tokens_expiry ON presence_tokens(expires_at);

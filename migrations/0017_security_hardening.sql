-- Security hardening: social read sessions, IP rate buckets, atomic currency balances.
CREATE TABLE IF NOT EXISTS social_session_challenges (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX social_session_challenges_owner ON social_session_challenges(owner, created_at);
CREATE INDEX social_session_challenges_expiry ON social_session_challenges(expires_at);

CREATE TABLE IF NOT EXISTS social_session_tokens (
  token TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX social_session_tokens_owner ON social_session_tokens(owner, expires_at);
CREATE INDEX social_session_tokens_expiry ON social_session_tokens(expires_at);

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  bucket_key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
CREATE INDEX rate_limit_buckets_window ON rate_limit_buckets(window_start);

CREATE TABLE IF NOT EXISTS account_balances (
  owner TEXT NOT NULL,
  currency TEXT NOT NULL CHECK(currency IN ('boinglets','sparkles')),
  balance INTEGER NOT NULL CHECK(balance >= 0),
  PRIMARY KEY (owner, currency)
);

INSERT INTO account_balances(owner, currency, balance)
SELECT owner, currency, CAST(SUM(delta) AS INTEGER) AS balance
FROM ledger
GROUP BY owner, currency
HAVING CAST(SUM(delta) AS INTEGER) >= 0;

-- Automatic, idempotent native BOING payouts for market fills.
-- 0025 created market_payouts with pending/sent/failed. This upgrade adds
-- confirmed status, signed tx storage, attempts, alerts, and a unique fill+leg key.
-- Do not apply remotely until approved.

CREATE TABLE market_payouts_v2 (
  id TEXT PRIMARY KEY,
  payment_tx TEXT NOT NULL,
  listing_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('seller','sink')),
  recipient TEXT NOT NULL,
  amount_boing TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','sent','confirmed','failed')),
  payout_tx TEXT,
  signed_tx TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(payment_tx, kind)
);
INSERT INTO market_payouts_v2(
  id,payment_tx,listing_id,kind,recipient,amount_boing,status,payout_tx,signed_tx,attempts,last_error,created_at,updated_at
)
SELECT
  id,payment_tx,listing_id,kind,recipient,amount_boing,status,payout_tx,NULL,0,NULL,created_at,updated_at
FROM market_payouts;
DROP TABLE market_payouts;
ALTER TABLE market_payouts_v2 RENAME TO market_payouts;
CREATE INDEX IF NOT EXISTS market_payouts_status ON market_payouts(status, updated_at);
CREATE INDEX IF NOT EXISTS market_payouts_recipient ON market_payouts(recipient, created_at DESC);

CREATE TABLE IF NOT EXISTS market_payout_alerts (
  id TEXT PRIMARY KEY,
  payout_id TEXT,
  payment_tx TEXT,
  code TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);
CREATE INDEX IF NOT EXISTS market_payout_alerts_open
  ON market_payout_alerts(code, payout_id, created_at DESC);

-- Phase 4: allow signed daily Sparkles faucet challenges (testnet, no checkout).
PRAGMA foreign_keys = OFF;

CREATE TABLE economy_challenges_v2 (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN (
    'claim','buy_catalog','list','buy_listing','cancel_listing','sparkles_claim'
  )),
  payload TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
INSERT INTO economy_challenges_v2 SELECT * FROM economy_challenges;
DROP TABLE economy_challenges;
ALTER TABLE economy_challenges_v2 RENAME TO economy_challenges;
CREATE INDEX economy_challenges_owner ON economy_challenges(owner, created_at);
CREATE INDEX economy_challenges_expiry ON economy_challenges(expires_at);

PRAGMA foreign_keys = ON;

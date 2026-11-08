-- Phase 6: quest progress, seasonal claims, titles, collection unlocks.
CREATE TABLE IF NOT EXISTS content_challenges (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('quest_claim')),
  payload TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX content_challenges_owner ON content_challenges(owner, created_at);

CREATE TABLE IF NOT EXISTS quest_claims (
  owner TEXT NOT NULL,
  quest_id TEXT NOT NULL,
  period_key TEXT NOT NULL,
  claimed_at INTEGER NOT NULL,
  PRIMARY KEY (owner, quest_id, period_key)
);
CREATE INDEX quest_claims_owner ON quest_claims(owner, claimed_at);

CREATE TABLE IF NOT EXISTS titles (
  owner TEXT NOT NULL,
  code TEXT NOT NULL,
  unlocked_at INTEGER NOT NULL,
  PRIMARY KEY (owner, code)
);

CREATE TABLE IF NOT EXISTS collection_unlocks (
  owner TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  unlocked_at INTEGER NOT NULL,
  PRIMARY KEY (owner, entry_id)
);
CREATE INDEX collection_owner ON collection_unlocks(owner, unlocked_at);

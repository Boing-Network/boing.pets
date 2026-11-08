-- First activity loop: signed fishing casts (Phase 6 content).
CREATE TABLE IF NOT EXISTS fishing_challenges (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  day_key TEXT NOT NULL,
  fish_id TEXT NOT NULL,
  bite_at INTEGER NOT NULL,
  window_ms INTEGER NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX fishing_challenges_owner ON fishing_challenges(owner, created_at);
CREATE INDEX fishing_challenges_expiry ON fishing_challenges(expires_at);

CREATE TABLE IF NOT EXISTS fishing_catches (
  owner TEXT NOT NULL,
  day_key TEXT NOT NULL,
  count INTEGER NOT NULL CHECK(count >= 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (owner, day_key)
);

-- Treasure hunt activity: clue → dig → signed confirm (Phase 6).
CREATE TABLE IF NOT EXISTS treasure_challenges (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  day_key TEXT NOT NULL,
  spot INTEGER NOT NULL,
  loot_id TEXT NOT NULL,
  clue TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX treasure_challenges_owner ON treasure_challenges(owner, created_at);
CREATE INDEX treasure_challenges_expiry ON treasure_challenges(expires_at);

CREATE TABLE IF NOT EXISTS treasure_digs (
  owner TEXT NOT NULL,
  day_key TEXT NOT NULL,
  count INTEGER NOT NULL CHECK(count >= 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (owner, day_key)
);

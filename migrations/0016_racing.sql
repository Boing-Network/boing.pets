-- Pet racing activity: signed heats with finish-line timing (Phase 6).
CREATE TABLE IF NOT EXISTS race_challenges (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  day_key TEXT NOT NULL,
  track_id TEXT NOT NULL,
  go_at INTEGER NOT NULL,
  window_ms INTEGER NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX race_challenges_owner ON race_challenges(owner, created_at);
CREATE INDEX race_challenges_expiry ON race_challenges(expires_at);

CREATE TABLE IF NOT EXISTS race_heats (
  owner TEXT NOT NULL,
  day_key TEXT NOT NULL,
  count INTEGER NOT NULL CHECK(count >= 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (owner, day_key)
);

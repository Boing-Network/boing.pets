-- Phase 2.5: optional signed world position sync (localStorage remains primary).
CREATE TABLE IF NOT EXISTS world_challenges (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  zone TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  z REAL NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX world_challenges_owner ON world_challenges(owner, created_at);
CREATE INDEX world_challenges_expiry ON world_challenges(expires_at);

CREATE TABLE IF NOT EXISTS player_positions (
  owner TEXT PRIMARY KEY,
  zone TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  z REAL NOT NULL,
  updated_at INTEGER NOT NULL
);

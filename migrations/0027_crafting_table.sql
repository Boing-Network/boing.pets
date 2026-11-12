-- Crafting table challenges and audit log. Local only until approved.
CREATE TABLE IF NOT EXISTS craft_challenges (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  recipe_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS craft_challenges_owner ON craft_challenges(owner, created_at);
CREATE INDEX IF NOT EXISTS craft_challenges_expiry ON craft_challenges(expires_at);

CREATE TABLE IF NOT EXISTS craft_log (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  recipe_id TEXT NOT NULL,
  output_item TEXT NOT NULL,
  output_qty INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  utc_day INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS craft_log_owner_day ON craft_log(owner, utc_day);
CREATE INDEX IF NOT EXISTS craft_log_owner_time ON craft_log(owner, created_at);

CREATE TABLE IF NOT EXISTS craft_guard (
  id TEXT PRIMARY KEY,
  ok INTEGER NOT NULL CHECK (ok = 1)
);

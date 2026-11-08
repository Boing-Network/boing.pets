-- Cooking activity: cook recipes → serve snacks for care boosts (Phase 6).
CREATE TABLE IF NOT EXISTS cook_challenges (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('cook','serve')),
  payload TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX cook_challenges_owner ON cook_challenges(owner, created_at);
CREATE INDEX cook_challenges_expiry ON cook_challenges(expires_at);

CREATE TABLE IF NOT EXISTS snack_log (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  food_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  day INTEGER NOT NULL
);
CREATE INDEX snack_log_owner_day ON snack_log(owner, day);
CREATE INDEX snack_log_owner_time ON snack_log(owner, created_at);

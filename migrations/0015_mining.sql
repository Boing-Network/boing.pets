-- Mining activity: strike veins with daily stamina (Phase 6).
CREATE TABLE IF NOT EXISTS mining_challenges (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  day_key TEXT NOT NULL,
  ore_id TEXT NOT NULL,
  strike_at INTEGER NOT NULL,
  window_ms INTEGER NOT NULL,
  stamina_cost INTEGER NOT NULL,
  pickaxe_tier INTEGER NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX mining_challenges_owner ON mining_challenges(owner, created_at);
CREATE INDEX mining_challenges_expiry ON mining_challenges(expires_at);

CREATE TABLE IF NOT EXISTS mining_stamina (
  owner TEXT NOT NULL,
  day_key TEXT NOT NULL,
  spent INTEGER NOT NULL CHECK(spent >= 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (owner, day_key)
);

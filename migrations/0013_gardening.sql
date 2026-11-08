-- Gardening activity: plant → water → harvest (Phase 6).
CREATE TABLE IF NOT EXISTS garden_challenges (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('plant','water','harvest')),
  payload TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX garden_challenges_owner ON garden_challenges(owner, created_at);
CREATE INDEX garden_challenges_expiry ON garden_challenges(expires_at);

CREATE TABLE IF NOT EXISTS garden_plots (
  owner TEXT NOT NULL,
  slot INTEGER NOT NULL CHECK(slot >= 0 AND slot < 3),
  crop_id TEXT NOT NULL,
  planted_at INTEGER NOT NULL,
  ready_at INTEGER NOT NULL,
  watered INTEGER NOT NULL CHECK(watered IN (0,1)),
  PRIMARY KEY (owner, slot)
);
CREATE INDEX garden_plots_owner ON garden_plots(owner);

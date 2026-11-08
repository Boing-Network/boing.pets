-- Housing foundation: one plot per wallet, place/pickup furniture (Phase 6).
CREATE TABLE IF NOT EXISTS housing_challenges (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('place','pickup','set_visibility')),
  payload TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX housing_challenges_owner ON housing_challenges(owner, created_at);
CREATE INDEX housing_challenges_expiry ON housing_challenges(expires_at);

CREATE TABLE IF NOT EXISTS housing_plots (
  owner TEXT PRIMARY KEY,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  visibility TEXT NOT NULL CHECK(visibility IN ('private','public')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS housing_placements (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  item_id TEXT NOT NULL,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(owner, x, y)
);
CREATE INDEX housing_placements_owner ON housing_placements(owner);

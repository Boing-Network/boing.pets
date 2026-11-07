export const postgresSchema = `
CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('hatch', 'feed', 'checkin')),
  message TEXT NOT NULL,
  amount TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  min_height BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS challenges_expiry ON challenges (expires_at);
CREATE INDEX IF NOT EXISTS challenges_owner ON challenges (owner, created_at);
CREATE TABLE IF NOT EXISTS pets (
  owner TEXT PRIMARY KEY,
  hatch_tx TEXT NOT NULL UNIQUE,
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY REFERENCES challenges (id),
  owner TEXT NOT NULL REFERENCES pets (owner),
  action TEXT NOT NULL CHECK (action IN ('hatch', 'feed', 'checkin')),
  tx_hash TEXT UNIQUE,
  created_at BIGINT NOT NULL,
  day INTEGER NOT NULL,
  UNIQUE (owner, action, day)
);
CREATE INDEX IF NOT EXISTS events_owner_time ON events (owner, created_at);
CREATE INDEX IF NOT EXISTS pets_recent ON pets (created_at DESC, owner);
`;

-- Phase 1: expand care actions, achievements, and pet memory stub.
-- Rebuilds challenges/events so CHECK constraints accept play + groom.
-- Existing rows are copied; no pet identity is dropped.
PRAGMA foreign_keys = OFF;

CREATE TABLE challenges_v2 (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('hatch','feed','checkin','play','groom')),
  message TEXT NOT NULL,
  amount TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  min_height INTEGER NOT NULL
);
INSERT INTO challenges_v2 SELECT * FROM challenges;
DROP TABLE challenges;
ALTER TABLE challenges_v2 RENAME TO challenges;
CREATE INDEX challenges_expiry ON challenges(expires_at);
CREATE INDEX challenges_owner ON challenges(owner,created_at);

CREATE TABLE events_v2 (
  id TEXT PRIMARY KEY REFERENCES challenges(id),
  owner TEXT NOT NULL REFERENCES pets(owner),
  action TEXT NOT NULL CHECK(action IN ('hatch','feed','checkin','play','groom')),
  tx_hash TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  day INTEGER NOT NULL,
  UNIQUE(owner,action,day)
);
INSERT INTO events_v2 SELECT * FROM events;
DROP TABLE events;
ALTER TABLE events_v2 RENAME TO events;
CREATE INDEX events_owner_time ON events(owner,created_at);

CREATE TABLE IF NOT EXISTS achievements (
  owner TEXT NOT NULL REFERENCES pets(owner),
  code TEXT NOT NULL,
  unlocked_at INTEGER NOT NULL,
  PRIMARY KEY (owner, code)
);
CREATE INDEX achievements_owner ON achievements(owner, unlocked_at);

-- Stub for Phase 5 AI memory; unused by Phase 1 gameplay.
CREATE TABLE IF NOT EXISTS pet_memories (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL REFERENCES pets(owner),
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX pet_memories_owner ON pet_memories(owner, created_at);

PRAGMA foreign_keys = ON;

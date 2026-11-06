PRAGMA foreign_keys = ON;
CREATE TABLE challenges (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, action TEXT NOT NULL CHECK(action IN ('hatch','feed','checkin')),
 message TEXT NOT NULL, amount TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 min_height INTEGER NOT NULL
);
CREATE INDEX challenges_expiry ON challenges(expires_at);
CREATE INDEX challenges_owner ON challenges(owner,created_at);
CREATE TABLE pets (owner TEXT PRIMARY KEY, hatch_tx TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL);
CREATE TABLE events (
 id TEXT PRIMARY KEY REFERENCES challenges(id), owner TEXT NOT NULL REFERENCES pets(owner),
 action TEXT NOT NULL CHECK(action IN ('hatch','feed','checkin')), tx_hash TEXT UNIQUE,
 created_at INTEGER NOT NULL, day INTEGER NOT NULL,
 UNIQUE(owner,action,day)
);
CREATE INDEX events_owner_time ON events(owner,created_at);
CREATE INDEX pets_recent ON pets(created_at DESC,owner);
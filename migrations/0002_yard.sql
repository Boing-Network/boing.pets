CREATE TABLE IF NOT EXISTS kennel (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  contract TEXT NOT NULL UNIQUE,
  deployer TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS yard_challenges (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  action TEXT NOT NULL,
  message TEXT NOT NULL,
  amount TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  min_height INTEGER NOT NULL,
  detail TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pet_nfts (
  owner TEXT PRIMARY KEY,
  token_id TEXT NOT NULL,
  contract TEXT NOT NULL,
  mint_tx TEXT NOT NULL UNIQUE,
  staked INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS stalls (
  owner TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('pen', 'stand', 'toy')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (owner, kind)
);
CREATE TABLE IF NOT EXISTS yards (
  owner TEXT PRIMARY KEY,
  kibble INTEGER NOT NULL,
  settled_at INTEGER NOT NULL,
  bonded INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS yard_events (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  action TEXT NOT NULL,
  tx_hash TEXT,
  created_at INTEGER NOT NULL,
  day INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS presence (
  owner TEXT PRIMARY KEY,
  seen_at INTEGER NOT NULL
);

-- Party activity bonus tracking + daily variety log.
CREATE TABLE IF NOT EXISTS party_activity_log (
  id TEXT PRIMARY KEY,
  party_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  activity TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS party_activity_recent
  ON party_activity_log(party_id, activity, created_at DESC);
CREATE INDEX IF NOT EXISTS party_activity_owner_day
  ON party_activity_log(owner, created_at DESC);

CREATE TABLE IF NOT EXISTS activity_day_log (
  owner TEXT NOT NULL,
  day INTEGER NOT NULL,
  activity TEXT NOT NULL,
  PRIMARY KEY (owner, day, activity)
);

-- Interactive activity attempts (play without wallet tx; claim with signature).
CREATE TABLE IF NOT EXISTS activity_attempts (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  activity TEXT NOT NULL,
  day_key TEXT NOT NULL,
  status TEXT NOT NULL,
  secret_json TEXT NOT NULL,
  public_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  resolved_at INTEGER,
  claim_expires_at INTEGER,
  reward_json TEXT
);
CREATE INDEX IF NOT EXISTS activity_attempts_owner_day
  ON activity_attempts(owner, activity, day_key, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_attempts_status
  ON activity_attempts(status, claim_expires_at);

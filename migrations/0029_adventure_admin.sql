-- Idle Adventures phase 4 admin, overrides, and analytics.
-- Apply locally only until Nico approves a remote migration.
CREATE TABLE IF NOT EXISTS adventure_popup_events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  pool_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS adventure_popup_events_window
  ON adventure_popup_events(status, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS adventure_overrides (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  version INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  note TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS adventure_overrides_kind_version
  ON adventure_overrides(kind, version);
CREATE INDEX IF NOT EXISTS adventure_overrides_kind_latest
  ON adventure_overrides(kind, version DESC);

CREATE TABLE IF NOT EXISTS adventure_override_audit (
  id TEXT PRIMARY KEY,
  override_id TEXT,
  version INTEGER NOT NULL,
  action TEXT NOT NULL,
  kind TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  actor TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  note TEXT
);
CREATE INDEX IF NOT EXISTS adventure_override_audit_kind
  ON adventure_override_audit(kind, created_at DESC);

CREATE TABLE IF NOT EXISTS adventure_events (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL,
  day_key TEXT NOT NULL,
  owner TEXT NOT NULL,
  type TEXT NOT NULL,
  location_id TEXT,
  duration_id TEXT,
  outcome TEXT,
  rarity TEXT,
  mint_status TEXT,
  run_id TEXT,
  payload_json TEXT
);
CREATE INDEX IF NOT EXISTS adventure_events_day_type
  ON adventure_events(day_key, type);
CREATE INDEX IF NOT EXISTS adventure_events_location
  ON adventure_events(location_id, day_key);
CREATE INDEX IF NOT EXISTS adventure_events_duration
  ON adventure_events(duration_id, day_key);
CREATE INDEX IF NOT EXISTS adventure_events_owner_day
  ON adventure_events(owner, day_key);

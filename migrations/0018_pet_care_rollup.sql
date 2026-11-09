-- Denormalized care rollup so pasture enrich does not scan full event history.
CREATE TABLE IF NOT EXISTS pet_care_rollup (
  owner TEXT PRIMARY KEY,
  last_care INTEGER NOT NULL,
  last_fed INTEGER NOT NULL,
  last_play INTEGER NOT NULL,
  last_groom INTEGER NOT NULL,
  care_days_json TEXT NOT NULL,
  action_counts_json TEXT NOT NULL,
  today_day INTEGER NOT NULL,
  today_actions_json TEXT NOT NULL,
  had_balanced_day INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

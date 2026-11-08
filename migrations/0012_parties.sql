-- Party invites foundation (Phase 3 social).
PRAGMA foreign_keys = OFF;

CREATE TABLE social_challenges_v2 (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN (
    'set_profile','friend_request','friend_accept','friend_decline','friend_remove','send_message',
    'party_create','party_invite','party_accept','party_decline','party_leave'
  )),
  payload TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
INSERT INTO social_challenges_v2 SELECT * FROM social_challenges;
DROP TABLE social_challenges;
ALTER TABLE social_challenges_v2 RENAME TO social_challenges;
CREATE INDEX social_challenges_owner ON social_challenges(owner, created_at);

CREATE TABLE IF NOT EXISTS parties (
  id TEXT PRIMARY KEY,
  leader TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('open','disbanded')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX parties_leader ON parties(leader, status);

CREATE TABLE IF NOT EXISTS party_members (
  party_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('leader','member')),
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (party_id, owner)
);
CREATE UNIQUE INDEX party_members_one_party ON party_members(owner);
CREATE INDEX party_members_party ON party_members(party_id);

CREATE TABLE IF NOT EXISTS party_invites (
  id TEXT PRIMARY KEY,
  party_id TEXT NOT NULL,
  from_owner TEXT NOT NULL,
  to_owner TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','accepted','declined','cancelled')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(party_id, to_owner)
);
CREATE INDEX party_invites_to ON party_invites(to_owner, status, created_at DESC);

PRAGMA foreign_keys = ON;

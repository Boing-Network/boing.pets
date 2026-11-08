-- Friends, DMs, and lightweight profiles (Phase 3 social backlog).
CREATE TABLE IF NOT EXISTS social_challenges (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN (
    'set_profile','friend_request','friend_accept','friend_decline','friend_remove','send_message'
  )),
  payload TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX social_challenges_owner ON social_challenges(owner, created_at);

CREATE TABLE IF NOT EXISTS profiles (
  owner TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  title TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS friend_requests (
  id TEXT PRIMARY KEY,
  from_owner TEXT NOT NULL,
  to_owner TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','accepted','declined','cancelled')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(from_owner, to_owner)
);
CREATE INDEX friend_requests_to ON friend_requests(to_owner, status, created_at DESC);
CREATE INDEX friend_requests_from ON friend_requests(from_owner, status);

CREATE TABLE IF NOT EXISTS friendships (
  owner_a TEXT NOT NULL,
  owner_b TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (owner_a, owner_b),
  CHECK(owner_a < owner_b)
);
CREATE INDEX friendships_a ON friendships(owner_a);
CREATE INDEX friendships_b ON friendships(owner_b);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  from_owner TEXT NOT NULL,
  to_owner TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  read_at INTEGER
);
CREATE INDEX messages_thread ON messages(from_owner, to_owner, created_at);
CREATE INDEX messages_inbox ON messages(to_owner, created_at DESC);

-- App-owned authentication: the webmail gets its own identity (master
-- password + passkeys) and any number of linked Stalwart mail accounts.
-- Existing per-user tables stay keyed by mail-account email and are
-- untouched; linking an account re-attaches its data automatically.

-- The webmail's own user. Single row for now; schema permits more later.
CREATE TABLE IF NOT EXISTS app_user (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,        -- login identifier
  password_hash TEXT NOT NULL,               -- scrypt: N.r.p.salt.hash (base64url)
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Linked mail accounts. The Stalwart password is stored encrypted
-- (AES-256-GCM, key derived from WEBMAIL_SECRET) so background schedulers
-- can act for every account across restarts.
CREATE TABLE IF NOT EXISTS mail_accounts (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  email            TEXT NOT NULL UNIQUE,
  server_url       TEXT NOT NULL,
  jmap_account_id  TEXT NOT NULL,
  secret_enc       TEXT NOT NULL,            -- iv.tag.ciphertext (base64url)
  display_name     TEXT,
  color            TEXT NOT NULL DEFAULT '#8B5CF6',
  sort_order       INTEGER NOT NULL DEFAULT 0,
  needs_reauth     INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  last_verified_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_mail_accounts_user ON mail_accounts(user_id, sort_order);

-- Webmail sessions. DB-backed so they survive container restarts.
CREATE TABLE IF NOT EXISTS app_sessions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at   TEXT NOT NULL,
  user_agent   TEXT,
  ip           TEXT
);

CREATE INDEX IF NOT EXISTS idx_app_sessions_user ON app_sessions(user_id);

-- WebAuthn credentials (passkeys).
CREATE TABLE IF NOT EXISTS passkeys (
  id           TEXT PRIMARY KEY,             -- credential id, base64url
  user_id      TEXT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  public_key   TEXT NOT NULL,                -- COSE public key, base64url
  counter      INTEGER NOT NULL DEFAULT 0,
  transports   TEXT,                         -- JSON array
  name         TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_passkeys_user ON passkeys(user_id);

-- Short-lived WebAuthn challenges (5-minute TTL, deleted on use).
CREATE TABLE IF NOT EXISTS webauthn_challenges (
  challenge  TEXT PRIMARY KEY,
  user_id    TEXT,                           -- NULL for usernameless login
  type       TEXT NOT NULL CHECK (type IN ('reg', 'auth')),
  expires_at TEXT NOT NULL
);

-- Fixed-window login rate limiting, persisted so restarts don't reset it.
CREATE TABLE IF NOT EXISTS login_attempts (
  key          TEXT PRIMARY KEY,             -- email|ip
  window_start TEXT NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT
);

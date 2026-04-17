-- Per-user settings. Keyed by Stalwart principal email (the login).
CREATE TABLE IF NOT EXISTS user_settings (
  user_email     TEXT PRIMARY KEY,
  avatar_data    TEXT,
  avatar_offset  TEXT,              -- JSON string: {"x":0,"y":0,"zoom":1}
  display_name   TEXT,
  settings       TEXT NOT NULL DEFAULT '{}',  -- JSON string
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Per-label metadata. Keyed by JMAP mailbox ID.
CREATE TABLE IF NOT EXISTS label_meta (
  user_email   TEXT NOT NULL,
  mailbox_id   TEXT NOT NULL,
  display_name TEXT NOT NULL,
  color        TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_email, mailbox_id)
);

-- Per-folder metadata.
CREATE TABLE IF NOT EXISTS folder_meta (
  user_email   TEXT NOT NULL,
  mailbox_id   TEXT NOT NULL,
  display_name TEXT NOT NULL,
  color        TEXT NOT NULL,
  icon         TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_email, mailbox_id)
);

-- Signatures. Multiple per user, one marked default.
CREATE TABLE IF NOT EXISTS signatures (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_email   TEXT NOT NULL,
  name         TEXT NOT NULL,
  html         TEXT NOT NULL,
  is_default   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_signatures_user ON signatures(user_email);

-- One default per user. Partial unique index — multiple non-default rows
-- per user are fine; only one row may be marked is_default = 1.
CREATE UNIQUE INDEX IF NOT EXISTS idx_signatures_one_default
  ON signatures(user_email) WHERE is_default = 1;

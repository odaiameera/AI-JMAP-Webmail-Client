-- Mail rules, moved off the per-browser cookie into server-side storage so
-- they follow the user across devices. Stored as a JSON document (the app
-- works with an ordered Rule[]).
CREATE TABLE IF NOT EXISTS user_rules (
  user_email TEXT PRIMARY KEY,
  rules_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Per-user cursor for the auto-apply worker: the timestamp up to which inbox
-- mail has already been run through the rules. New mail received after this
-- is processed on the next tick. NULL until the first run (which seeds it to
-- "now" so we never retro-process the whole backlog).
CREATE TABLE IF NOT EXISTS rules_cursor (
  user_email TEXT PRIMARY KEY,
  last_run   TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Phase 15b: cache the identities Stalwart returns from Identity/get so we
-- don't hit JMAP on every composer open, and store the user's per-identity
-- signature override (separate table because identities are server-owned
-- cache; the override pointer is our data).

CREATE TABLE IF NOT EXISTS identities (
  user_email     TEXT NOT NULL,
  jmap_id        TEXT NOT NULL,
  email          TEXT NOT NULL,
  name           TEXT,
  reply_to       TEXT,
  is_primary     INTEGER NOT NULL DEFAULT 0,
  last_synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_email, jmap_id)
);

CREATE INDEX IF NOT EXISTS idx_identities_user ON identities(user_email);

-- Override pointer: per (user, identity), pin a specific signature. Cascade
-- on signature delete so we never end up with a dangling pointer; the
-- composer's resolver will fall back to the global default automatically.
CREATE TABLE IF NOT EXISTS identity_signatures (
  user_email   TEXT NOT NULL,
  identity_id  TEXT NOT NULL,
  signature_id INTEGER NOT NULL,
  PRIMARY KEY (user_email, identity_id),
  FOREIGN KEY (signature_id) REFERENCES signatures(id) ON DELETE CASCADE
);

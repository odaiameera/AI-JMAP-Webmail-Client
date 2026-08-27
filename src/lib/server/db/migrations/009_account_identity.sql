-- Account identity (per linked mailbox) and app-level identity + preferences
-- (per webmail login).
--
-- Why a new table rather than more columns on user_settings: user_settings is
-- keyed by the ACTIVE MAIL ACCOUNT's email, so with two linked accounts a
-- person had two display names, two avatars and two settings blobs, and
-- switching accounts silently switched all three. Name, avatar and
-- preferences belong to the person, not to a mailbox, so they key on
-- app_user.id. Per-mailbox data (labels, folders, signatures, identities)
-- correctly stays on user_settings and is untouched.

-- A face for each linked mailbox. Same storage contract as the personal
-- avatar: a data: URL the client has already compressed to 256px JPEG, so a
-- real avatar is 10-25KB. Deliberately NOT surfaced through toPublic() —
-- that output ships inside every page's server payload, so the bytes are
-- served from /api/accounts/[id]/avatar and cached by the browser instead.
ALTER TABLE mail_accounts ADD COLUMN avatar_data TEXT;

CREATE TABLE IF NOT EXISTS app_prefs (
  user_id       TEXT PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  display_name  TEXT,
  avatar_data   TEXT,
  avatar_offset TEXT,                          -- JSON: {"x":0,"y":0,"zoom":1}
  prefs         TEXT NOT NULL DEFAULT '{}',    -- JSON: the former cookie prefs
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Carry across whatever the per-mailbox rows already hold, so nobody loses an
-- avatar or a name they had already set. Each field is picked independently
-- from the first linked account that has one, ordered the same way the account
-- switcher orders them, so the choice is deterministic rather than whichever
-- row SQLite happens to visit first.
INSERT INTO app_prefs (user_id, display_name, avatar_data, avatar_offset, prefs)
SELECT
  u.id,
  (SELECT us.display_name FROM user_settings us
     JOIN mail_accounts ma ON ma.email = us.user_email
    WHERE ma.user_id = u.id AND us.display_name IS NOT NULL AND us.display_name <> ''
    ORDER BY ma.sort_order, ma.created_at LIMIT 1),
  (SELECT us.avatar_data FROM user_settings us
     JOIN mail_accounts ma ON ma.email = us.user_email
    WHERE ma.user_id = u.id AND us.avatar_data IS NOT NULL
    ORDER BY ma.sort_order, ma.created_at LIMIT 1),
  (SELECT us.avatar_offset FROM user_settings us
     JOIN mail_accounts ma ON ma.email = us.user_email
    WHERE ma.user_id = u.id AND us.avatar_data IS NOT NULL
    ORDER BY ma.sort_order, ma.created_at LIMIT 1),
  COALESCE(
    (SELECT us.settings FROM user_settings us
       JOIN mail_accounts ma ON ma.email = us.user_email
      WHERE ma.user_id = u.id AND us.settings IS NOT NULL AND us.settings <> '{}'
      ORDER BY ma.sort_order, ma.created_at LIMIT 1),
    '{}'
  )
FROM app_user u
-- `WHERE true` is load-bearing: after INSERT ... SELECT, SQLite's parser
-- cannot tell whether ON CONFLICT belongs to the SELECT or the INSERT, and
-- rejects it outright. A trailing WHERE closes the SELECT so the upsert
-- clause parses. See sqlite.org/lang_upsert.html#parsing_ambiguity.
WHERE true
ON CONFLICT (user_id) DO NOTHING;

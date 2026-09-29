-- Automatic Trash emptying (Settings → Messages → "Empty Trash
-- automatically").
--
-- JMAP records when a message arrived, not when it was moved to Trash, and
-- "deleted 30 days after arrival" would purge an old message the hour it was
-- trashed. So the sweep keeps its own clock: each time it looks at an
-- account's Trash it stamps any message it hasn't seen there before, forgets
-- messages that have left (restored, or deleted by hand), and deletes those
-- whose stamp is older than the retention period. A message restored and
-- trashed again starts over.
--
-- Keyed on the linked account row, so unlinking an account drops its rows.
CREATE TABLE IF NOT EXISTS trash_seen (
  account_id  TEXT NOT NULL REFERENCES mail_accounts(id) ON DELETE CASCADE,
  email_id    TEXT NOT NULL,
  first_seen  INTEGER NOT NULL,              -- epoch ms
  PRIMARY KEY (account_id, email_id)
);

CREATE INDEX IF NOT EXISTS idx_trash_seen_age ON trash_seen(account_id, first_seen);

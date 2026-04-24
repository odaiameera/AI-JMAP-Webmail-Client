-- Phase 14: Remind Me Later.
--
-- `reminders` tracks emails that have been moved into the "Remind Me Later"
-- mailbox with a scheduled return time. The scheduler queries `remind_at <=
-- datetime('now')`, moves the email back to `original_mailbox_id`, clears
-- the `$seen` keyword, and deletes the row.
CREATE TABLE IF NOT EXISTS reminders (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  user_email          TEXT NOT NULL,
  account_id          TEXT NOT NULL,
  jmap_email_id       TEXT NOT NULL,
  original_mailbox_id TEXT NOT NULL,
  remind_at           TEXT NOT NULL,       -- ISO 8601 UTC
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(remind_at);
CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reminders_email_user
  ON reminders(user_email, jmap_email_id);

-- Badge markers: emails currently displayed with a "returned from reminder"
-- clock icon next to the subject. Rows are written when the scheduler
-- returns a reminder, cleared when the user opens the email, and a nightly
-- sweep drops anything older than 7 days.
CREATE TABLE IF NOT EXISTS reminded_markers (
  user_email    TEXT NOT NULL,
  jmap_email_id TEXT NOT NULL,
  returned_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_email, jmap_email_id)
);

CREATE INDEX IF NOT EXISTS idx_markers_returned ON reminded_markers(returned_at);

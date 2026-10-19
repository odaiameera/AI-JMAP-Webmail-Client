-- Delay send and Send later.
--
-- A message waiting to go out is a real Email in the account's "Scheduled"
-- mailbox, created with its Date header set to `send_at`. This row is the
-- server's promise to submit it then — whether or not any browser is open.
-- The row goes once the message is sent or the send is cancelled; a send
-- that fails stays, as 'failed', until it is retried or cancelled.
CREATE TABLE IF NOT EXISTS scheduled_sends (
  id               TEXT PRIMARY KEY,
  mail_account_id  TEXT NOT NULL REFERENCES mail_accounts(id) ON DELETE CASCADE,
  jmap_email_id    TEXT NOT NULL,
  identity_id      TEXT NOT NULL,
  envelope         TEXT NOT NULL,                 -- JSON: { mailFrom, rcptTo[] } (Bcc included)
  send_at          TEXT NOT NULL,                 -- ISO 8601 UTC
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'sending', 'failed')),
  attempts         INTEGER NOT NULL DEFAULT 0,
  last_error       TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_scheduled_sends_due ON scheduled_sends(status, send_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduled_sends_email
  ON scheduled_sends(mail_account_id, jmap_email_id);

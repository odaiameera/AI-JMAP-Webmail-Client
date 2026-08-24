-- Agent chat history, kept as conversations rather than one flat log so the
-- panel can list past sessions and reopen any of them.
--
-- Retention is deliberately short (see AI_HISTORY_RETENTION_DAYS): these rows
-- are the user's own words plus model replies derived from their mail, so
-- keeping them indefinitely would quietly turn a chat panel into a second,
-- unmanaged copy of the mailbox. Pruning runs on write, so an idle account
-- does not accumulate history it never asked to keep.
--
-- Timestamps are epoch milliseconds (INTEGER) rather than the datetime('now')
-- strings used by older tables here: this data is ordered and windowed far
-- more than it is read by a human, and integer comparison keeps the retention
-- sweep and the "most recent first" index straightforward.

CREATE TABLE IF NOT EXISTS ai_conversations (
	id         TEXT PRIMARY KEY,
	user_email TEXT NOT NULL,
	-- Derived from the opening user message; '' until one is sent.
	title      TEXT NOT NULL DEFAULT '',
	created_at INTEGER NOT NULL,
	-- Bumped on every message, so both the session list order and the
	-- retention window follow real activity rather than creation time.
	updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user
	ON ai_conversations (user_email, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_messages (
	id              INTEGER PRIMARY KEY AUTOINCREMENT,
	conversation_id TEXT NOT NULL
		REFERENCES ai_conversations (id) ON DELETE CASCADE,
	role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
	-- Markdown as the model produced it. Rendering to HTML happens on read,
	-- so a change to the sanitising allowlist applies to old messages too
	-- instead of leaving already-stored HTML frozen under the old rules.
	content         TEXT NOT NULL,
	created_at      INTEGER NOT NULL
);

-- Replay order within a conversation; the autoincrement id is the tiebreak
-- for two messages written inside the same millisecond.
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation
	ON ai_messages (conversation_id, id);

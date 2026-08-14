-- Per-user calendar presentation state. The calendars themselves live on the
-- CalDAV server; this table only stores what DAV has no good home for:
-- swatch color and sidebar visibility.
CREATE TABLE IF NOT EXISTS calendar_meta (
	user_email  TEXT NOT NULL,
	calendar_id TEXT NOT NULL,
	color       TEXT,
	hidden      INTEGER NOT NULL DEFAULT 0,
	created_at  TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
	PRIMARY KEY (user_email, calendar_id)
);

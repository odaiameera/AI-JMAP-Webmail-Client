import { getDb } from '../index';

/**
 * Per-account Jev settings. See migrations 011_jev.sql and
 * 012_jev_sorting.sql for why they key on the linked account rather than
 * the login.
 */

/**
 * Jev as the spam layer: off; watch — verdicts recorded and shown beside
 * Stalwart's, nothing moves; active — confident verdicts move mail.
 */
export type SpamMode = 'off' | 'watch' | 'active';

export const SPAM_MODES: SpamMode[] = ['off', 'watch', 'active'];

export function isSpamMode(value: unknown): value is SpamMode {
	return typeof value === 'string' && (SPAM_MODES as string[]).includes(value);
}

export interface JevSettings {
	/** Split the Inbox into Important / Updates / Newsletters / Promotions. */
	inboxTabs: boolean;
	/**
	 * Let Jev read this account's new mail — to sort it into tabs (with
	 * `inboxTabs`) and to judge rule conditions written for Jev.
	 */
	jevEnabled: boolean;
	/** ISO receivedAt new mail has been queued up to; null while Jev is off. */
	sortCursor: string | null;
	/** Jev as the spam layer; only acted on while `jevEnabled`. */
	spamMode: SpamMode;
}

export const DEFAULT_JEV_SETTINGS: JevSettings = {
	inboxTabs: false,
	jevEnabled: false,
	sortCursor: null,
	spamMode: 'off'
};

let _stmts: ReturnType<typeof prepareStmts> | null = null;

/**
 * Prepared lazily for the same reason as the other query modules here:
 * preparing at module scope would open the database during `vite build`'s
 * SSR pass, before migrations have run.
 */
function prepareStmts() {
	const db = getDb();
	return {
		get: db.prepare(
			'SELECT inbox_tabs, jev_enabled, sort_cursor, spam_mode FROM jev_settings WHERE account_id = ?'
		),
		upsert: db.prepare(
			`INSERT INTO jev_settings (account_id, inbox_tabs, jev_enabled, sort_cursor, spam_mode, updated_at)
			 VALUES (@accountId, @inboxTabs, @jevEnabled, @sortCursor, @spamMode, @now)
			 ON CONFLICT (account_id) DO UPDATE SET
			   inbox_tabs = excluded.inbox_tabs,
			   jev_enabled = excluded.jev_enabled,
			   sort_cursor = excluded.sort_cursor,
			   spam_mode = excluded.spam_mode,
			   updated_at = excluded.updated_at`
		)
	};
}
function stmts() {
	return (_stmts ??= prepareStmts());
}

export function getJevSettings(accountId: string): JevSettings {
	const row = stmts().get.get(accountId) as
		| { inbox_tabs: number; jev_enabled: number; sort_cursor: string | null; spam_mode: string }
		| undefined;
	if (!row) return { ...DEFAULT_JEV_SETTINGS };
	return {
		inboxTabs: row.inbox_tabs === 1,
		jevEnabled: row.jev_enabled === 1,
		sortCursor: row.sort_cursor,
		spamMode: isSpamMode(row.spam_mode) ? row.spam_mode : 'off'
	};
}

/**
 * Merge `patch` into the account's settings and persist the result.
 * Switching Jev on starts its cursor at `now`, so Jev only ever sees mail
 * that arrives from then on; switching it off clears the cursor.
 */
export function updateJevSettings(
	accountId: string,
	patch: Partial<JevSettings>,
	now = new Date()
): JevSettings {
	const current = getJevSettings(accountId);
	const next = { ...current, ...patch };
	if (patch.jevEnabled === true && !current.jevEnabled) next.sortCursor = now.toISOString();
	if (patch.jevEnabled === false) next.sortCursor = null;
	stmts().upsert.run({
		accountId,
		inboxTabs: next.inboxTabs ? 1 : 0,
		jevEnabled: next.jevEnabled ? 1 : 0,
		sortCursor: next.sortCursor,
		spamMode: next.spamMode,
		now: now.getTime()
	});
	return next;
}

/** Is sorting into tabs live for this account: tabs shown and Jev allowed to read? */
export function sortingEnabled(settings: JevSettings): boolean {
	return settings.inboxTabs && settings.jevEnabled;
}

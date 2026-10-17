import { getDb } from '../index';

/**
 * Per-account Jev settings. See migrations 011_jev.sql and
 * 012_jev_sorting.sql for why they key on the linked account rather than
 * the login.
 */

export interface JevSettings {
	/** Split the Inbox into Important / Updates / Newsletters / Promotions. */
	inboxTabs: boolean;
	/** Let Jev read this account's new mail and sort it into tabs. */
	autoSort: boolean;
	/** ISO receivedAt new mail has been queued up to; null while sorting is off. */
	sortCursor: string | null;
}

export const DEFAULT_JEV_SETTINGS: JevSettings = {
	inboxTabs: false,
	autoSort: false,
	sortCursor: null
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
			'SELECT inbox_tabs, auto_sort, sort_cursor FROM jev_settings WHERE account_id = ?'
		),
		upsert: db.prepare(
			`INSERT INTO jev_settings (account_id, inbox_tabs, auto_sort, sort_cursor, updated_at)
			 VALUES (@accountId, @inboxTabs, @autoSort, @sortCursor, @now)
			 ON CONFLICT (account_id) DO UPDATE SET
			   inbox_tabs = excluded.inbox_tabs,
			   auto_sort = excluded.auto_sort,
			   sort_cursor = excluded.sort_cursor,
			   updated_at = excluded.updated_at`
		)
	};
}
function stmts() {
	return (_stmts ??= prepareStmts());
}

export function getJevSettings(accountId: string): JevSettings {
	const row = stmts().get.get(accountId) as
		| { inbox_tabs: number; auto_sort: number; sort_cursor: string | null }
		| undefined;
	if (!row) return { ...DEFAULT_JEV_SETTINGS };
	return {
		inboxTabs: row.inbox_tabs === 1,
		autoSort: row.auto_sort === 1,
		sortCursor: row.sort_cursor
	};
}

/**
 * Merge `patch` into the account's settings and persist the result.
 * Switching sorting on starts its cursor at `now`, so Jev only ever sees
 * mail that arrives from then on; switching it off clears the cursor.
 */
export function updateJevSettings(
	accountId: string,
	patch: Partial<JevSettings>,
	now = new Date()
): JevSettings {
	const current = getJevSettings(accountId);
	const next = { ...current, ...patch };
	if (patch.autoSort === true && !current.autoSort) next.sortCursor = now.toISOString();
	if (patch.autoSort === false) next.sortCursor = null;
	stmts().upsert.run({
		accountId,
		inboxTabs: next.inboxTabs ? 1 : 0,
		autoSort: next.autoSort ? 1 : 0,
		sortCursor: next.sortCursor,
		now: now.getTime()
	});
	return next;
}

/** Is sorting live for this account: tabs shown and Jev allowed to read? */
export function sortingEnabled(settings: JevSettings): boolean {
	return settings.inboxTabs && settings.autoSort;
}

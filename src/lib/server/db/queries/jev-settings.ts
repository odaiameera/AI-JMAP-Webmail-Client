import { getDb } from '../index';

/**
 * Per-account Jev settings. See migration 011_jev.sql for why they key on
 * the linked account rather than the login.
 */

export interface JevSettings {
	/** Split the Inbox into Important / Updates / Newsletters / Promotions. */
	inboxTabs: boolean;
}

export const DEFAULT_JEV_SETTINGS: JevSettings = { inboxTabs: false };

let _stmts: ReturnType<typeof prepareStmts> | null = null;

/**
 * Prepared lazily for the same reason as the other query modules here:
 * preparing at module scope would open the database during `vite build`'s
 * SSR pass, before migrations have run.
 */
function prepareStmts() {
	const db = getDb();
	return {
		get: db.prepare('SELECT inbox_tabs FROM jev_settings WHERE account_id = ?'),
		upsert: db.prepare(
			`INSERT INTO jev_settings (account_id, inbox_tabs, updated_at)
			 VALUES (@accountId, @inboxTabs, @now)
			 ON CONFLICT (account_id) DO UPDATE SET
			   inbox_tabs = excluded.inbox_tabs,
			   updated_at = excluded.updated_at`
		)
	};
}
function stmts() {
	return (_stmts ??= prepareStmts());
}

export function getJevSettings(accountId: string): JevSettings {
	const row = stmts().get.get(accountId) as { inbox_tabs: number } | undefined;
	if (!row) return { ...DEFAULT_JEV_SETTINGS };
	return { inboxTabs: row.inbox_tabs === 1 };
}

/** Merge `patch` into the account's settings and persist the result. */
export function updateJevSettings(accountId: string, patch: Partial<JevSettings>): JevSettings {
	const next = { ...getJevSettings(accountId), ...patch };
	stmts().upsert.run({ accountId, inboxTabs: next.inboxTabs ? 1 : 0, now: Date.now() });
	return next;
}

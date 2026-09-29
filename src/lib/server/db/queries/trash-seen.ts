import { getDb } from '../index';

/**
 * When the Trash sweep first saw each message in an account's Trash. See
 * migration 010_trash_retention.sql for why the app keeps this itself.
 */

let _stmts: ReturnType<typeof prepareStmts> | null = null;

/**
 * Prepared lazily for the same reason as the other query modules here:
 * preparing at module scope would open the database during `vite build`'s
 * SSR pass, before migrations have run.
 */
function prepareStmts() {
	const db = getDb();
	return {
		listIds: db.prepare(`SELECT email_id FROM trash_seen WHERE account_id = ?`),
		insert: db.prepare(
			`INSERT INTO trash_seen (account_id, email_id, first_seen) VALUES (?, ?, ?)
			 ON CONFLICT (account_id, email_id) DO NOTHING`
		),
		remove: db.prepare(`DELETE FROM trash_seen WHERE account_id = ? AND email_id = ?`),
		clear: db.prepare(`DELETE FROM trash_seen WHERE account_id = ?`),
		expired: db.prepare(
			`SELECT email_id FROM trash_seen WHERE account_id = ? AND first_seen <= ?
			 ORDER BY first_seen`
		)
	};
}
function stmts() {
	return (_stmts ??= prepareStmts());
}

/**
 * Reconcile with the ids currently in Trash: stamp newcomers with `now` and,
 * when `ids` is the complete listing, forget ids that are no longer there.
 * One transaction, so a crash midway never leaves half a snapshot.
 */
export function recordTrashSnapshot(
	accountId: string,
	ids: string[],
	now: number,
	complete = true
): void {
	const s = stmts();
	const current = new Set(ids);
	getDb().transaction(() => {
		if (complete) {
			const known = (s.listIds.all(accountId) as { email_id: string }[]).map((r) => r.email_id);
			for (const id of known) if (!current.has(id)) s.remove.run(accountId, id);
		}
		for (const id of current) s.insert.run(accountId, id, now);
	})();
}

/** Ids first seen in Trash at or before `cutoff` (epoch ms), oldest first. */
export function expiredTrashIds(accountId: string, cutoff: number): string[] {
	return (stmts().expired.all(accountId, cutoff) as { email_id: string }[]).map((r) => r.email_id);
}

export function forgetTrashIds(accountId: string, ids: string[]): void {
	const s = stmts();
	getDb().transaction(() => {
		for (const id of ids) s.remove.run(accountId, id);
	})();
}

/** Drop every stamp for an account — the feature was turned off. */
export function clearTrashSeen(accountId: string): void {
	stmts().clear.run(accountId);
}

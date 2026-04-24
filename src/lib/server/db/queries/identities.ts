import { getDb } from '../index';

export interface IdentityRow {
	jmapId: string;
	email: string;
	name: string | null;
	replyTo: string | null;
	isPrimary: boolean;
}

interface DbIdentityRow {
	jmap_id: string;
	email: string;
	name: string | null;
	reply_to: string | null;
	is_primary: number;
}

let _stmts: ReturnType<typeof prepareStmts> | null = null;
function prepareStmts() {
	const db = getDb();
	return {
		list: db.prepare(
			`SELECT jmap_id, email, name, reply_to, is_primary
			 FROM identities WHERE user_email = ?
			 ORDER BY is_primary DESC, email ASC`
		),
		listIds: db.prepare(`SELECT jmap_id FROM identities WHERE user_email = ?`),
		upsert: db.prepare(
			`INSERT INTO identities (user_email, jmap_id, email, name, reply_to, is_primary, last_synced_at)
			 VALUES (@userEmail, @jmapId, @email, @name, @replyTo, @isPrimary, datetime('now'))
			 ON CONFLICT(user_email, jmap_id) DO UPDATE SET
			   email          = excluded.email,
			   name           = excluded.name,
			   reply_to       = excluded.reply_to,
			   is_primary     = excluded.is_primary,
			   last_synced_at = datetime('now')`
		),
		deleteMissing: db.prepare(
			`DELETE FROM identities
			 WHERE user_email = ? AND jmap_id NOT IN (SELECT value FROM json_each(?))`
		),
		// Identity-signature override rows pointing at identities that no
		// longer exist for this user — caller invokes after deleteMissing.
		cleanupOrphanOverrides: db.prepare(
			`DELETE FROM identity_signatures
			 WHERE user_email = ?
			   AND identity_id NOT IN (SELECT jmap_id FROM identities WHERE user_email = ?)`
		)
	};
}
function stmts() {
	return (_stmts ??= prepareStmts());
}

function rowToIdentity(row: DbIdentityRow): IdentityRow {
	return {
		jmapId: row.jmap_id,
		email: row.email,
		name: row.name,
		replyTo: row.reply_to,
		isPrimary: row.is_primary === 1
	};
}

export function listIdentities(userEmail: string): IdentityRow[] {
	const rows = stmts().list.all(userEmail) as DbIdentityRow[];
	return rows.map(rowToIdentity);
}

/**
 * Replace the cached identity set for `userEmail` with the freshly fetched
 * `incoming` list. Anything missing from `incoming` is removed; orphaned
 * `identity_signatures` overrides are cleaned up in the same transaction.
 */
export function syncIdentities(
	userEmail: string,
	incoming: Array<{
		jmapId: string;
		email: string;
		name: string | null;
		replyTo: string | null;
		isPrimary: boolean;
	}>
): IdentityRow[] {
	const s = stmts();
	const tx = getDb().transaction(() => {
		for (const id of incoming) {
			s.upsert.run({
				userEmail,
				jmapId: id.jmapId,
				email: id.email,
				name: id.name,
				replyTo: id.replyTo,
				isPrimary: id.isPrimary ? 1 : 0
			});
		}
		const keepIds = JSON.stringify(incoming.map((i) => i.jmapId));
		s.deleteMissing.run(userEmail, keepIds);
		s.cleanupOrphanOverrides.run(userEmail, userEmail);
	});
	tx();
	return listIdentities(userEmail);
}

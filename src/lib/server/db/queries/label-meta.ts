import { getDb } from '../index';

export interface LabelMetaRow {
	mailboxId: string;
	displayName: string;
	color: string;
	/** A Lucide icon name; '' or null for none. */
	icon: string | null;
	createdAt: number;
}

interface DbLabelMetaRow {
	mailboxId: string;
	displayName: string;
	color: string;
	icon: string | null;
	createdAt: string;
}

let _stmts: ReturnType<typeof prepareStmts> | null = null;
function prepareStmts() {
	const db = getDb();
	return {
		getAll: db.prepare(
			`SELECT mailbox_id AS mailboxId,
			        display_name AS displayName,
			        color,
			        icon,
			        created_at AS createdAt
			 FROM label_meta
			 WHERE user_email = ?`
		),
		getOne: db.prepare(
			`SELECT mailbox_id AS mailboxId,
			        display_name AS displayName,
			        color,
			        icon,
			        created_at AS createdAt
			 FROM label_meta
			 WHERE user_email = ? AND mailbox_id = ?`
		),
		upsert: db.prepare(
			`INSERT INTO label_meta (user_email, mailbox_id, display_name, color, icon)
			 VALUES (@userEmail, @mailboxId, @displayName, @color, @icon)
			 ON CONFLICT (user_email, mailbox_id) DO UPDATE SET
			   display_name = COALESCE(excluded.display_name, label_meta.display_name),
			   color        = COALESCE(excluded.color,        label_meta.color),
			   icon         = COALESCE(excluded.icon,         label_meta.icon),
			   updated_at   = datetime('now')`
		),
		delete: db.prepare(
			`DELETE FROM label_meta WHERE user_email = ? AND mailbox_id = ?`
		)
	};
}
function stmts() {
	return (_stmts ??= prepareStmts());
}

function rowToMeta(row: DbLabelMetaRow | undefined): LabelMetaRow | null {
	if (!row) return null;
	const createdAt = Date.parse(row.createdAt + 'Z');
	return {
		mailboxId: row.mailboxId,
		displayName: row.displayName,
		color: row.color,
		icon: row.icon,
		createdAt: Number.isFinite(createdAt) ? createdAt : 0
	};
}

export function getLabelsForUser(userEmail: string): LabelMetaRow[] {
	const rows = stmts().getAll.all(userEmail) as DbLabelMetaRow[];
	return rows.map((r) => rowToMeta(r) as LabelMetaRow);
}

export function getLabelMeta(userEmail: string, mailboxId: string): LabelMetaRow | null {
	const row = stmts().getOne.get(userEmail, mailboxId) as DbLabelMetaRow | undefined;
	return rowToMeta(row);
}

export function upsertLabelMeta(
	userEmail: string,
	mailboxId: string,
	patch: { displayName?: string | null; color?: string | null; icon?: string | null }
): void {
	stmts().upsert.run({
		userEmail,
		mailboxId,
		displayName: patch.displayName ?? null,
		color: patch.color ?? null,
		icon: patch.icon ?? null
	});
}

export function deleteLabelMeta(userEmail: string, mailboxId: string): void {
	stmts().delete.run(userEmail, mailboxId);
}

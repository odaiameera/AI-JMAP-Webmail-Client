import { db } from '../index';

export interface LabelMetaRow {
	mailboxId: string;
	displayName: string;
	color: string;
	createdAt: number;
}

interface DbLabelMetaRow {
	mailboxId: string;
	displayName: string;
	color: string;
	createdAt: string;
}

const getAllStmt = db.prepare(
	`SELECT mailbox_id AS mailboxId,
	        display_name AS displayName,
	        color,
	        created_at AS createdAt
	 FROM label_meta
	 WHERE user_email = ?`
);

const getOneStmt = db.prepare(
	`SELECT mailbox_id AS mailboxId,
	        display_name AS displayName,
	        color,
	        created_at AS createdAt
	 FROM label_meta
	 WHERE user_email = ? AND mailbox_id = ?`
);

const upsertStmt = db.prepare(
	`INSERT INTO label_meta (user_email, mailbox_id, display_name, color)
	 VALUES (@userEmail, @mailboxId, @displayName, @color)
	 ON CONFLICT (user_email, mailbox_id) DO UPDATE SET
	   display_name = COALESCE(excluded.display_name, label_meta.display_name),
	   color        = COALESCE(excluded.color,        label_meta.color),
	   updated_at   = datetime('now')`
);

const deleteStmt = db.prepare(
	`DELETE FROM label_meta WHERE user_email = ? AND mailbox_id = ?`
);

function rowToMeta(row: DbLabelMetaRow | undefined): LabelMetaRow | null {
	if (!row) return null;
	const createdAt = Date.parse(row.createdAt + 'Z');
	return {
		mailboxId: row.mailboxId,
		displayName: row.displayName,
		color: row.color,
		createdAt: Number.isFinite(createdAt) ? createdAt : 0
	};
}

export function getLabelsForUser(userEmail: string): LabelMetaRow[] {
	const rows = getAllStmt.all(userEmail) as DbLabelMetaRow[];
	return rows.map((r) => rowToMeta(r) as LabelMetaRow);
}

export function getLabelMeta(userEmail: string, mailboxId: string): LabelMetaRow | null {
	const row = getOneStmt.get(userEmail, mailboxId) as DbLabelMetaRow | undefined;
	return rowToMeta(row);
}

export function upsertLabelMeta(
	userEmail: string,
	mailboxId: string,
	patch: { displayName?: string | null; color?: string | null }
): void {
	upsertStmt.run({
		userEmail,
		mailboxId,
		displayName: patch.displayName ?? null,
		color: patch.color ?? null
	});
}

export function deleteLabelMeta(userEmail: string, mailboxId: string): void {
	deleteStmt.run(userEmail, mailboxId);
}

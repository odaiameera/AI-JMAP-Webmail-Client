import { getDb } from '../index';

export interface FolderMetaRow {
	mailboxId: string;
	displayName: string;
	color: string;
	icon: string | null;
}

let _stmts: ReturnType<typeof prepareStmts> | null = null;
function prepareStmts() {
	const db = getDb();
	return {
		getAll: db.prepare(
			`SELECT mailbox_id AS mailboxId,
			        display_name AS displayName,
			        color,
			        icon
			 FROM folder_meta
			 WHERE user_email = ?`
		),
		getOne: db.prepare(
			`SELECT mailbox_id AS mailboxId,
			        display_name AS displayName,
			        color,
			        icon
			 FROM folder_meta
			 WHERE user_email = ? AND mailbox_id = ?`
		),
		upsert: db.prepare(
			`INSERT INTO folder_meta (user_email, mailbox_id, display_name, color, icon)
			 VALUES (@userEmail, @mailboxId, @displayName, @color, @icon)
			 ON CONFLICT (user_email, mailbox_id) DO UPDATE SET
			   display_name = COALESCE(excluded.display_name, folder_meta.display_name),
			   color        = COALESCE(excluded.color,        folder_meta.color),
			   icon         = COALESCE(excluded.icon,         folder_meta.icon),
			   updated_at   = datetime('now')`
		),
		delete: db.prepare(
			`DELETE FROM folder_meta WHERE user_email = ? AND mailbox_id = ?`
		)
	};
}
function stmts() {
	return (_stmts ??= prepareStmts());
}

export function getFoldersForUser(userEmail: string): FolderMetaRow[] {
	return stmts().getAll.all(userEmail) as FolderMetaRow[];
}

export function getFolderMeta(userEmail: string, mailboxId: string): FolderMetaRow | null {
	return (stmts().getOne.get(userEmail, mailboxId) as FolderMetaRow | undefined) ?? null;
}

export function upsertFolderMeta(
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

export function deleteFolderMeta(userEmail: string, mailboxId: string): void {
	stmts().delete.run(userEmail, mailboxId);
}

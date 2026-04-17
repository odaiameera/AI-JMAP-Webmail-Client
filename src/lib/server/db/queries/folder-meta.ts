import { db } from '../index';

export interface FolderMetaRow {
	mailboxId: string;
	displayName: string;
	color: string;
	icon: string | null;
}

const getAllStmt = db.prepare(
	`SELECT mailbox_id AS mailboxId,
	        display_name AS displayName,
	        color,
	        icon
	 FROM folder_meta
	 WHERE user_email = ?`
);

const getOneStmt = db.prepare(
	`SELECT mailbox_id AS mailboxId,
	        display_name AS displayName,
	        color,
	        icon
	 FROM folder_meta
	 WHERE user_email = ? AND mailbox_id = ?`
);

const upsertStmt = db.prepare(
	`INSERT INTO folder_meta (user_email, mailbox_id, display_name, color, icon)
	 VALUES (@userEmail, @mailboxId, @displayName, @color, @icon)
	 ON CONFLICT (user_email, mailbox_id) DO UPDATE SET
	   display_name = COALESCE(excluded.display_name, folder_meta.display_name),
	   color        = COALESCE(excluded.color,        folder_meta.color),
	   icon         = COALESCE(excluded.icon,         folder_meta.icon),
	   updated_at   = datetime('now')`
);

const deleteStmt = db.prepare(
	`DELETE FROM folder_meta WHERE user_email = ? AND mailbox_id = ?`
);

export function getFoldersForUser(userEmail: string): FolderMetaRow[] {
	return getAllStmt.all(userEmail) as FolderMetaRow[];
}

export function getFolderMeta(userEmail: string, mailboxId: string): FolderMetaRow | null {
	return (getOneStmt.get(userEmail, mailboxId) as FolderMetaRow | undefined) ?? null;
}

export function upsertFolderMeta(
	userEmail: string,
	mailboxId: string,
	patch: { displayName?: string | null; color?: string | null; icon?: string | null }
): void {
	upsertStmt.run({
		userEmail,
		mailboxId,
		displayName: patch.displayName ?? null,
		color: patch.color ?? null,
		icon: patch.icon ?? null
	});
}

export function deleteFolderMeta(userEmail: string, mailboxId: string): void {
	deleteStmt.run(userEmail, mailboxId);
}

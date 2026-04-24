import { getDb } from '../index';

export interface ReminderRow {
	id: number;
	user_email: string;
	account_id: string;
	jmap_email_id: string;
	original_mailbox_id: string;
	remind_at: string;
	created_at: string;
}

let _stmts: ReturnType<typeof prepareStmts> | null = null;

function prepareStmts() {
	const db = getDb();
	return {
		insert: db.prepare(
			`INSERT INTO reminders
			   (user_email, account_id, jmap_email_id, original_mailbox_id, remind_at)
			 VALUES (?, ?, ?, ?, ?)
			 ON CONFLICT (user_email, jmap_email_id)
			 DO UPDATE SET
			   original_mailbox_id = excluded.original_mailbox_id,
			   remind_at = excluded.remind_at`
		),
		deleteByEmail: db.prepare(
			`DELETE FROM reminders WHERE user_email = ? AND jmap_email_id = ?`
		),
		getByEmail: db.prepare(
			`SELECT * FROM reminders WHERE user_email = ? AND jmap_email_id = ?`
		),
		listForUser: db.prepare(
			`SELECT * FROM reminders WHERE user_email = ? ORDER BY remind_at ASC`
		),
		dueForUser: db.prepare(
			`SELECT * FROM reminders
			 WHERE user_email = ? AND remind_at <= datetime('now')
			 ORDER BY remind_at ASC`
		),
		insertMarker: db.prepare(
			`INSERT INTO reminded_markers (user_email, jmap_email_id)
			 VALUES (?, ?)
			 ON CONFLICT (user_email, jmap_email_id)
			 DO UPDATE SET returned_at = datetime('now')`
		),
		deleteMarker: db.prepare(
			`DELETE FROM reminded_markers WHERE user_email = ? AND jmap_email_id = ?`
		),
		listMarkers: db.prepare(
			`SELECT jmap_email_id FROM reminded_markers WHERE user_email = ?`
		),
		cleanupMarkers: db.prepare(
			`DELETE FROM reminded_markers
			 WHERE returned_at < datetime('now', '-7 days')`
		)
	};
}

function stmts() {
	return (_stmts ??= prepareStmts());
}

export function scheduleReminder(
	userEmail: string,
	accountId: string,
	emailId: string,
	originalMailboxId: string,
	remindAtIso: string
): void {
	stmts().insert.run(userEmail, accountId, emailId, originalMailboxId, remindAtIso);
}

export function cancelReminder(userEmail: string, emailId: string): ReminderRow | null {
	const s = stmts();
	const row = s.getByEmail.get(userEmail, emailId) as ReminderRow | undefined;
	if (!row) return null;
	s.deleteByEmail.run(userEmail, emailId);
	return row;
}

export function getReminder(userEmail: string, emailId: string): ReminderRow | null {
	return (stmts().getByEmail.get(userEmail, emailId) as ReminderRow | undefined) ?? null;
}

export function listReminders(userEmail: string): ReminderRow[] {
	return stmts().listForUser.all(userEmail) as ReminderRow[];
}

export function listDueReminders(userEmail: string): ReminderRow[] {
	return stmts().dueForUser.all(userEmail) as ReminderRow[];
}

export function deleteReminder(userEmail: string, emailId: string): void {
	stmts().deleteByEmail.run(userEmail, emailId);
}

export function markReturned(userEmail: string, emailId: string): void {
	stmts().insertMarker.run(userEmail, emailId);
}

export function clearMarker(userEmail: string, emailId: string): void {
	stmts().deleteMarker.run(userEmail, emailId);
}

export function listMarkedIds(userEmail: string): string[] {
	const rows = stmts().listMarkers.all(userEmail) as { jmap_email_id: string }[];
	return rows.map((r) => r.jmap_email_id);
}

export function cleanupOldMarkers(): void {
	stmts().cleanupMarkers.run();
}

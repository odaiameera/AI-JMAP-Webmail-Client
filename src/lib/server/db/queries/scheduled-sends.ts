import { randomUUID } from 'node:crypto';
import { getDb } from '../index';

export type ScheduledStatus = 'pending' | 'sending' | 'failed';

export interface ScheduledSendRow {
	id: string;
	mail_account_id: string;
	jmap_email_id: string;
	identity_id: string;
	/** JSON {@link Envelope}. */
	envelope: string;
	send_at: string;
	status: ScheduledStatus;
	attempts: number;
	last_error: string | null;
	created_at: string;
}

export interface Envelope {
	mailFrom: { email: string };
	rcptTo: { email: string }[];
}

// send_at holds `Date.toISOString()` strings ('…T…Z'), so "now" has to be
// that shape too; datetime('now') uses a space, which sorts before 'T'.
const NOW = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;

let _stmts: ReturnType<typeof prepareStmts> | null = null;

function prepareStmts() {
	const db = getDb();
	return {
		insert: db.prepare(
			`INSERT INTO scheduled_sends
			   (id, mail_account_id, jmap_email_id, identity_id, envelope, send_at)
			 VALUES (?, ?, ?, ?, ?, ?)`
		),
		get: db.prepare(
			`SELECT * FROM scheduled_sends WHERE mail_account_id = ? AND jmap_email_id = ?`
		),
		listForAccount: db.prepare(
			`SELECT * FROM scheduled_sends WHERE mail_account_id = ? ORDER BY send_at ASC`
		),
		// Claiming and the status change are one statement, so two sweeps can
		// never both pick up the same row.
		claimDue: db.prepare(
			`UPDATE scheduled_sends
			 SET status = 'sending', attempts = attempts + 1
			 WHERE status = 'pending' AND send_at <= ${NOW}
			 RETURNING *`
		),
		// Only a send that isn't under way can be cancelled.
		cancel: db.prepare(
			`DELETE FROM scheduled_sends
			 WHERE mail_account_id = ? AND jmap_email_id = ? AND status IN ('pending', 'failed')
			 RETURNING *`
		),
		retryNow: db.prepare(
			`UPDATE scheduled_sends
			 SET status = 'pending', send_at = ${NOW}, attempts = 0, last_error = NULL
			 WHERE mail_account_id = ? AND jmap_email_id = ? AND status = 'failed'
			 RETURNING *`
		),
		retryLater: db.prepare(
			`UPDATE scheduled_sends SET status = 'pending', send_at = ?, last_error = ? WHERE id = ?`
		),
		fail: db.prepare(`UPDATE scheduled_sends SET status = 'failed', last_error = ? WHERE id = ?`),
		remove: db.prepare(`DELETE FROM scheduled_sends WHERE id = ?`),
		recoverInterrupted: db.prepare(
			`UPDATE scheduled_sends SET status = 'pending' WHERE status = 'sending'`
		)
	};
}

function stmts() {
	return (_stmts ??= prepareStmts());
}

export function insertScheduledSend(row: {
	mailAccountId: string;
	emailId: string;
	identityId: string;
	envelope: Envelope;
	sendAt: string;
}): void {
	stmts().insert.run(
		randomUUID(),
		row.mailAccountId,
		row.emailId,
		row.identityId,
		JSON.stringify(row.envelope),
		row.sendAt
	);
}

export function getScheduledSend(mailAccountId: string, emailId: string): ScheduledSendRow | null {
	return (stmts().get.get(mailAccountId, emailId) as ScheduledSendRow | undefined) ?? null;
}

export function listScheduledSends(mailAccountId: string): ScheduledSendRow[] {
	return stmts().listForAccount.all(mailAccountId) as ScheduledSendRow[];
}

/** Every pending send that is due, now marked 'sending'. */
export function claimDueSends(): ScheduledSendRow[] {
	return stmts().claimDue.all() as ScheduledSendRow[];
}

/** Drop a pending or failed send. Null when there is none, or it's being sent. */
export function cancelScheduledSendRow(mailAccountId: string, emailId: string): ScheduledSendRow | null {
	return (stmts().cancel.get(mailAccountId, emailId) as ScheduledSendRow | undefined) ?? null;
}

/** Put a failed send back in the queue, due now. Null when it isn't a failed send. */
export function retryScheduledSendNow(mailAccountId: string, emailId: string): ScheduledSendRow | null {
	return (stmts().retryNow.get(mailAccountId, emailId) as ScheduledSendRow | undefined) ?? null;
}

export function retryScheduledSendLater(id: string, sendAt: string, error: string): void {
	stmts().retryLater.run(sendAt, error, id);
}

export function failScheduledSend(id: string, error: string): void {
	stmts().fail.run(error, id);
}

export function removeScheduledSend(id: string): void {
	stmts().remove.run(id);
}

/**
 * Sends a previous process was in the middle of. Back to pending: the
 * worker checks that each message is still waiting in Scheduled before
 * submitting, and a submitted one has already moved to Sent.
 */
export function recoverInterruptedSends(): void {
	stmts().recoverInterrupted.run();
}

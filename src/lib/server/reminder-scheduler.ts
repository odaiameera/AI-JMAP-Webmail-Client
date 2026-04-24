import cron from 'node-cron';
import { listActiveAuthsByUser } from './session';
import { createClient } from '$lib/jmap/auth';
import { ensureRemindMeLaterMailbox } from '$lib/jmap/mailbox';
import {
	listDueReminders,
	deleteReminder,
	markReturned,
	cleanupOldMarkers,
	type ReminderRow
} from './db/queries/reminders';
import type { AuthState } from '$lib/jmap/types';

/**
 * Fires every minute. Iterates the users who currently have a live
 * session in memory and processes any due reminders for each. Reminders
 * for users without an active session stay queued until the user logs
 * back in (there's no persisted credential store to impersonate them).
 *
 * Running this every minute is enough for the product: the user either
 * has the tab open (SSE push picks up the moved email instantly) or is
 * away (in which case "within a minute of returning" is fine).
 */

let started = false;

export function startReminderScheduler(): void {
	if (started) return;
	started = true;

	cron.schedule('* * * * *', async () => {
		const active = listActiveAuthsByUser();
		for (const [userEmail, auth] of active) {
			const due = listDueReminders(userEmail);
			if (due.length === 0) continue;
			for (const r of due) {
				try {
					await returnReminder(auth, userEmail, r);
				} catch (err) {
					// Leave the row; next tick will retry. One noisy log is
					// better than a silent stall since this is a background
					// job users can't see.
					console.error('[reminder] return failed', r.id, err);
				}
			}
		}
	});

	// Daily marker sweep at 03:15 local. Cheap query, idempotent.
	cron.schedule('15 3 * * *', () => {
		try {
			cleanupOldMarkers();
		} catch (err) {
			console.error('[reminder] marker cleanup failed', err);
		}
	});
}

/**
 * Process a single due reminder: move the email from the RML mailbox back
 * to its original mailbox, clear the read flag so it looks new again,
 * record the "returned from reminder" marker, then drop the reminders row.
 */
async function returnReminder(
	auth: AuthState,
	userEmail: string,
	r: ReminderRow
): Promise<void> {
	const client = createClient(auth);
	const rmlId = await ensureRemindMeLaterMailbox(client, r.account_id);
	if (!rmlId) throw new Error('Remind Me Later mailbox missing');

	await client.request([
		[
			'Email/set',
			{
				accountId: r.account_id,
				update: {
					[r.jmap_email_id]: {
						[`mailboxIds/${rmlId}`]: null,
						[`mailboxIds/${r.original_mailbox_id}`]: true,
						'keywords/$seen': null
					}
				}
			},
			'0'
		]
	]);

	markReturned(userEmail, r.jmap_email_id);
	deleteReminder(userEmail, r.jmap_email_id);
}

/**
 * On-demand path used by hooks.server.ts. When a request lands for an
 * authenticated user we process any reminders that are already due so the
 * user isn't waiting up to 60s on the cron tick. Errors swallowed — we'd
 * rather the request continue than 500 over a reminder glitch.
 */
export async function processDueRemindersForUser(
	auth: AuthState,
	userEmail: string
): Promise<void> {
	try {
		const due = listDueReminders(userEmail);
		for (const r of due) {
			await returnReminder(auth, userEmail, r);
		}
	} catch (err) {
		console.error('[reminder] on-demand return failed', err);
	}
}

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '$lib/jmap/auth';
import { moveEmail } from '$lib/jmap/email';
import { ensureRemindMeLaterMailbox } from '$lib/jmap/mailbox';
import { userEmailFromAuth } from '$lib/server/user';
import { cancelReminder } from '$lib/server/db/queries/reminders';

/**
 * Cancel a pending reminder. Moves the email from the RML mailbox back to
 * its original mailbox and deletes the reminders row. No-op if there's no
 * active reminder for that id (returns 404 so the caller can surface it).
 */
export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.auth) return json({ error: 'Not authenticated' }, { status: 401 });

	try {
		const userEmail = userEmailFromAuth(locals.auth);
		const row = cancelReminder(userEmail, params.emailId);
		if (!row) {
			return json({ error: 'No active reminder for that email' }, { status: 404 });
		}

		const client = createClient(locals.auth);
		const rmlId = await ensureRemindMeLaterMailbox(client, locals.auth.accountId);
		await moveEmail(
			client,
			locals.auth.accountId,
			params.emailId,
			row.original_mailbox_id,
			rmlId
		);

		return json({ success: true, returnedTo: row.original_mailbox_id });
	} catch (err) {
		return json(
			{ error: err instanceof Error ? err.message : 'Failed to cancel reminder' },
			{ status: 500 }
		);
	}
};

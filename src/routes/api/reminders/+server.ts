import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '$lib/jmap/auth';
import { ensureRemindMeLaterMailbox } from '$lib/jmap/mailbox';
import { moveEmail } from '$lib/jmap/email';
import { userEmailFromAuth } from '$lib/server/user';
import { scheduleReminder, listReminders } from '$lib/server/db/queries/reminders';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.auth) return json({ error: 'Not authenticated' }, { status: 401 });

	const body = await request.json();
	const emailId = body.emailId as string | undefined;
	const remindAt = body.remindAt as string | undefined;
	const sourceMailboxId = body.sourceMailboxId as string | undefined;

	if (!emailId || !remindAt || !sourceMailboxId) {
		return json(
			{ error: 'emailId, remindAt, and sourceMailboxId are required' },
			{ status: 400 }
		);
	}
	const d = new Date(remindAt);
	if (isNaN(d.getTime())) {
		return json({ error: 'remindAt must be a valid ISO date' }, { status: 400 });
	}

	try {
		const userEmail = userEmailFromAuth(locals.auth);
		const client = createClient(locals.auth);
		const rmlId = await ensureRemindMeLaterMailbox(client, locals.auth.accountId);
		if (!rmlId) {
			return json({ error: 'Could not create Remind Me Later mailbox' }, { status: 500 });
		}
		if (sourceMailboxId === rmlId) {
			return json(
				{ error: 'Email is already in Remind Me Later' },
				{ status: 400 }
			);
		}

		await moveEmail(client, locals.auth.accountId, emailId, rmlId, sourceMailboxId);
		scheduleReminder(
			userEmail,
			locals.auth.accountId,
			emailId,
			sourceMailboxId,
			d.toISOString()
		);

		return json({ success: true, remindAt: d.toISOString() });
	} catch (err) {
		return json(
			{ error: err instanceof Error ? err.message : 'Failed to schedule reminder' },
			{ status: 500 }
		);
	}
};

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.auth) return json({ error: 'Not authenticated' }, { status: 401 });
	const userEmail = userEmailFromAuth(locals.auth);
	const rows = listReminders(userEmail).map((r) => ({
		emailId: r.jmap_email_id,
		originalMailboxId: r.original_mailbox_id,
		remindAt: r.remind_at
	}));
	return json({ reminders: rows });
};

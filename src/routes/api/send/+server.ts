import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '$lib/jmap/auth';
import { sendEmail, destroyEmail } from '$lib/jmap/email';
import { getMailboxes } from '$lib/jmap/mailbox';
import type { EmailAddress } from '$lib/jmap/types';

function parseAddresses(input: string): EmailAddress[] {
	if (!input.trim()) return [];
	return input
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean)
		.map((email) => ({ name: null, email }));
}

function getSenderEmail(authHeader: string): string {
	const decoded = atob(authHeader.replace('Basic ', ''));
	return decoded.split(':')[0];
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.auth) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	const body = await request.json();
	const to = parseAddresses(body.to ?? '');
	const cc = parseAddresses(body.cc ?? '');

	if (to.length === 0) {
		return json({ error: 'At least one recipient is required' }, { status: 400 });
	}

	const senderEmail = getSenderEmail(locals.auth.authHeader);

	try {
		const client = createClient(locals.auth);
		const mailboxes = await getMailboxes(client, locals.auth.accountId);
		const sentMailbox = mailboxes.find((m) => m.role === 'sent');

		if (!sentMailbox) {
			return json({ error: 'Sent folder not found' }, { status: 500 });
		}

		const result = await sendEmail(client, locals.auth.accountId, {
			from: { name: null, email: senderEmail },
			to,
			cc,
			subject: body.subject ?? '',
			body: body.body ?? '',
			...(body.inReplyTo && { inReplyTo: body.inReplyTo }),
			...(body.references && { references: body.references })
		}, sentMailbox.id);

		if (!result.success) {
			return json({ error: result.error ?? 'Failed to send' }, { status: 500 });
		}

		if (body.draftId) {
			try {
				await destroyEmail(client, locals.auth.accountId, body.draftId);
			} catch {
				// non-fatal — email sent, draft cleanup failed
			}
		}

		return json({ success: true });
	} catch (err) {
		return json({ error: err instanceof Error ? err.message : 'Failed to send' }, { status: 500 });
	}
};

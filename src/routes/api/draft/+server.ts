import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '$lib/jmap/auth';
import { saveDraft } from '$lib/jmap/email';
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
	const senderEmail = getSenderEmail(locals.auth.authHeader);

	try {
		const client = createClient(locals.auth);
		const mailboxes = await getMailboxes(client, locals.auth.accountId);
		const draftsMailbox = mailboxes.find((m) => m.role === 'drafts');

		if (!draftsMailbox) {
			return json({ error: 'Drafts folder not found' }, { status: 500 });
		}

		const result = await saveDraft(client, locals.auth.accountId, draftsMailbox.id, {
			from: { name: null, email: senderEmail },
			to: parseAddresses(body.to ?? ''),
			cc: parseAddresses(body.cc ?? ''),
			subject: body.subject ?? '',
			body: body.body ?? '',
			...(body.inReplyTo && { inReplyTo: body.inReplyTo }),
			...(body.references && { references: body.references })
		});

		if (!result.success) {
			return json({ error: result.error ?? 'Failed to save draft' }, { status: 500 });
		}

		return json({ success: true });
	} catch (err) {
		return json({ error: err instanceof Error ? err.message : 'Failed to save draft' }, { status: 500 });
	}
};

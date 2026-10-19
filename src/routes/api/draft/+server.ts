import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '$lib/jmap/auth';
import { saveDraft } from '$lib/jmap/email';
import { getMailboxes } from '$lib/jmap/mailbox';
import { userEmailFromAuth } from '$lib/server/user';
import { resolveIdentity } from '$lib/server/identity-resolve';
import {
	parseAddresses,
	parseAttachments,
	parseDraftId,
	parseImportance,
	parseMessageIds
} from '$lib/server/compose-input';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.auth) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	const body = await request.json();
	const userEmail = userEmailFromAuth(locals.auth);
	const identity = resolveIdentity(
		userEmail,
		typeof body.fromIdentityId === 'string' ? body.fromIdentityId : null,
		userEmail
	);
	const [inReplyTo] = parseMessageIds(body.inReplyTo);
	const references = parseMessageIds(body.references).join(' ');

	try {
		const client = createClient(locals.auth);
		const mailboxes = await getMailboxes(client, locals.auth.accountId);
		const draftsMailbox = mailboxes.find((m) => m.role === 'drafts');

		if (!draftsMailbox) {
			return json({ error: 'Drafts folder not found' }, { status: 500 });
		}

		// The previous version of this draft is replaced, not left behind.
		const result = await saveDraft(
			client,
			locals.auth.accountId,
			draftsMailbox.id,
			{
				from: { name: identity?.name ?? null, email: identity?.email ?? userEmail },
				to: parseAddresses(body.to),
				cc: parseAddresses(body.cc),
				bcc: parseAddresses(body.bcc),
				subject: typeof body.subject === 'string' ? body.subject : '',
				body: typeof body.body === 'string' ? body.body : '',
				attachments: parseAttachments(body.attachments),
				importance: parseImportance(body.importance),
				...(inReplyTo && { inReplyTo }),
				...(references && { references })
			},
			parseDraftId(body.draftId)
		);

		if (!result.success) {
			return json({ error: result.error ?? 'Failed to save draft' }, { status: 500 });
		}

		return json({ success: true, draftId: result.id });
	} catch (err) {
		return json({ error: err instanceof Error ? err.message : 'Failed to save draft' }, { status: 500 });
	}
};

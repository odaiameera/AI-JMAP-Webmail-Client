import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '$lib/jmap/auth';
import { sendEmail } from '$lib/jmap/email';
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
	const to = parseAddresses(body.to);
	const cc = parseAddresses(body.cc);
	const bcc = parseAddresses(body.bcc);
	const attachments = parseAttachments(body.attachments);
	const [inReplyTo] = parseMessageIds(body.inReplyTo);
	const references = parseMessageIds(body.references).join(' ');

	if (to.length === 0) {
		return json({ error: 'At least one recipient is required' }, { status: 400 });
	}

	const userEmail = userEmailFromAuth(locals.auth);
	const identity = resolveIdentity(
		userEmail,
		typeof body.fromIdentityId === 'string' ? body.fromIdentityId : null,
		userEmail
	);
	if (!identity || !identity.id) {
		return json({ error: 'No sending identity available' }, { status: 500 });
	}

	try {
		const client = createClient(locals.auth);
		const mailboxes = await getMailboxes(client, locals.auth.accountId);
		const sent = mailboxes.find((m) => m.role === 'sent');
		const drafts = mailboxes.find((m) => m.role === 'drafts');
		if (!sent || !drafts) {
			return json({ error: 'Sent or Drafts folder not found' }, { status: 500 });
		}

		const result = await sendEmail(
			client,
			locals.auth.accountId,
			{
				from: { name: identity.name, email: identity.email },
				to,
				cc,
				bcc,
				subject: typeof body.subject === 'string' ? body.subject : '',
				body: typeof body.body === 'string' ? body.body : '',
				attachments,
				importance: parseImportance(body.importance),
				...(inReplyTo && { inReplyTo }),
				...(references && { references })
			},
			{ drafts: drafts.id, sent: sent.id },
			{ id: identity.id, email: identity.email },
			{ replaceDraftId: parseDraftId(body.draftId) }
		);

		if (!result.success) {
			// The message is kept as a draft; hand its id back so the composer
			// carries on with it rather than with a draft that no longer exists.
			return json({ error: result.error ?? 'Failed to send', draftId: result.draftId }, { status: 502 });
		}
		return json({ success: true });
	} catch (err) {
		return json({ error: err instanceof Error ? err.message : 'Failed to send' }, { status: 500 });
	}
};

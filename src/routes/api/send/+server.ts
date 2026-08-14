import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '$lib/jmap/auth';
import { sendEmail, destroyEmail } from '$lib/jmap/email';
import { getMailboxes } from '$lib/jmap/mailbox';
import type { ComposeAttachment, EmailAddress } from '$lib/jmap/types';
import { userEmailFromAuth } from '$lib/server/user';
import { resolveIdentity } from '$lib/server/identity-resolve';

function parseAddresses(input: string): EmailAddress[] {
	if (!input.trim()) return [];
	return input
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean)
		.map((email) => ({ name: null, email }));
}

/** Coerce the client-supplied attachment list into trusted blob references. */
function parseAttachments(input: unknown): ComposeAttachment[] {
	if (!Array.isArray(input)) return [];
	return input
		.filter((a): a is ComposeAttachment => !!a && typeof a.blobId === 'string')
		.map((a) => ({
			blobId: a.blobId,
			name: typeof a.name === 'string' ? a.name : 'attachment',
			type: typeof a.type === 'string' ? a.type : 'application/octet-stream',
			size: typeof a.size === 'number' ? a.size : 0
		}));
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.auth) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	const body = await request.json();
	const to = parseAddresses(body.to ?? '');
	const cc = parseAddresses(body.cc ?? '');
	const bcc = parseAddresses(body.bcc ?? '');
	const attachments = parseAttachments(body.attachments);

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
		const sentMailbox = mailboxes.find((m) => m.role === 'sent');

		if (!sentMailbox) {
			return json({ error: 'Sent folder not found' }, { status: 500 });
		}

		const result = await sendEmail(
			client,
			locals.auth.accountId,
			{
				from: { name: identity.name, email: identity.email },
				to,
				cc,
				bcc,
				subject: body.subject ?? '',
				body: body.body ?? '',
				attachments,
				...(body.inReplyTo && { inReplyTo: body.inReplyTo }),
				...(body.references && { references: body.references })
			},
			sentMailbox.id,
			{ id: identity.id, email: identity.email }
		);

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

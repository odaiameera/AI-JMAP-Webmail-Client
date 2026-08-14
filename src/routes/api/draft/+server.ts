import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '$lib/jmap/auth';
import { saveDraft } from '$lib/jmap/email';
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
	const userEmail = userEmailFromAuth(locals.auth);
	const identity = resolveIdentity(
		userEmail,
		typeof body.fromIdentityId === 'string' ? body.fromIdentityId : null,
		userEmail
	);

	try {
		const client = createClient(locals.auth);
		const mailboxes = await getMailboxes(client, locals.auth.accountId);
		const draftsMailbox = mailboxes.find((m) => m.role === 'drafts');

		if (!draftsMailbox) {
			return json({ error: 'Drafts folder not found' }, { status: 500 });
		}

		const result = await saveDraft(client, locals.auth.accountId, draftsMailbox.id, {
			from: { name: identity?.name ?? null, email: identity?.email ?? userEmail },
			to: parseAddresses(body.to ?? ''),
			cc: parseAddresses(body.cc ?? ''),
			bcc: parseAddresses(body.bcc ?? ''),
			subject: body.subject ?? '',
			body: body.body ?? '',
			attachments: parseAttachments(body.attachments),
			...(body.inReplyTo && { inReplyTo: body.inReplyTo }),
			...(body.references && { references: body.references })
		});

		if (!result.success) {
			return json({ error: result.error ?? 'Failed to save draft' }, { status: 500 });
		}

		return json({ success: true, draftId: result.id });
	} catch (err) {
		return json({ error: err instanceof Error ? err.message : 'Failed to save draft' }, { status: 500 });
	}
};

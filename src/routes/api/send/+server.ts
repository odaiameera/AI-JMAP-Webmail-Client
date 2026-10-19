import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '$lib/jmap/auth';
import { sendEmail } from '$lib/jmap/email';
import { getMailboxes } from '$lib/jmap/mailbox';
import { userEmailFromAuth } from '$lib/server/user';
import { resolveIdentity } from '$lib/server/identity-resolve';
import { getPrefs } from '$lib/server/db/queries/app-prefs';
import { scheduleSend } from '$lib/server/scheduled-send';
import type { ComposeEmail } from '$lib/jmap/types';
import {
	parseAddresses,
	parseAttachments,
	parseDraftId,
	parseImportance,
	parseMessageIds,
	parseSendAt,
	parseUndoSendSeconds
} from '$lib/server/compose-input';

/**
 * Send, now or later. With `sendAt` the message is scheduled for then; with
 * Undo send on (the default) it is scheduled a few seconds out, so it can
 * still be taken back. Either way the server sends it at that time, open
 * browser or not, and the response says when.
 */

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

	const requestedAt = parseSendAt(body.sendAt);
	if (requestedAt === 'invalid') {
		return json({ error: 'Pick a time in the future' }, { status: 400 });
	}
	const undoSeconds = locals.user ? parseUndoSendSeconds(getPrefs(locals.user.id).undo_send_seconds) : 0;
	const sendAt = requestedAt ?? (undoSeconds > 0 ? new Date(Date.now() + undoSeconds * 1000) : null);

	const compose: ComposeEmail = {
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
	};

	// Without an account row there's nothing to send later with: Send later
	// fails rather than going now; Undo send just sends now.
	if (requestedAt && !locals.activeAccountId) {
		return json({ error: 'Couldn’t schedule the message' }, { status: 500 });
	}
	if (sendAt && locals.activeAccountId) {
		try {
			const result = await scheduleSend({
				mailAccountId: locals.activeAccountId,
				auth: locals.auth,
				compose,
				identity: { id: identity.id, email: identity.email },
				sendAt,
				replaceDraftId: parseDraftId(body.draftId)
			});
			if (!result.success) return json({ error: result.error }, { status: 502 });
			return json({
				success: true,
				scheduled: { emailId: result.emailId, sendAt: result.sendAt, undo: !requestedAt }
			});
		} catch (err) {
			return json({ error: err instanceof Error ? err.message : 'Failed to send' }, { status: 500 });
		}
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
			compose,
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

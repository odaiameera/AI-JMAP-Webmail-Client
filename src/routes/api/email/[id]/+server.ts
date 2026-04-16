import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '$lib/jmap/auth';
import { markEmail, trashEmail, archiveEmail, spamEmail, moveEmail } from '$lib/jmap/email';
import { getMailboxes, ensureArchiveMailbox } from '$lib/jmap/mailbox';

export const PATCH: RequestHandler = async ({ request, locals, params }) => {
	if (!locals.auth) return json({ error: 'Not authenticated' }, { status: 401 });

	const body = await request.json();
	const action = body.action as string;
	const emailId = params.id;
	const sourceMailboxId = body.sourceMailboxId as string | undefined;

	try {
		const client = createClient(locals.auth);
		const { accountId } = locals.auth;

		switch (action) {
			case 'markRead':
				await markEmail(client, accountId, emailId, true);
				break;
			case 'markUnread':
				await markEmail(client, accountId, emailId, false);
				break;
			case 'trash': {
				const mailboxes = await getMailboxes(client, accountId);
				const trash = mailboxes.find((m) => m.role === 'trash');
				if (!trash) return json({ error: 'Trash folder not found' }, { status: 500 });
				await trashEmail(client, accountId, emailId, sourceMailboxId ?? '', trash.id);
				break;
			}
			case 'archive': {
				const archiveId = await ensureArchiveMailbox(client, accountId);
				if (!archiveId) return json({ error: 'Could not create Archive' }, { status: 500 });
				await archiveEmail(client, accountId, emailId, sourceMailboxId ?? '', archiveId);
				break;
			}
			case 'spam': {
				const mailboxes = await getMailboxes(client, accountId);
				const junk = mailboxes.find((m) => m.role === 'junk');
				if (!junk) return json({ error: 'Junk folder not found' }, { status: 500 });
				await spamEmail(client, accountId, emailId, sourceMailboxId ?? '', junk.id);
				break;
			}
			case 'moveTo': {
				const targetMailboxId = body.targetMailboxId as string | undefined;
				if (!targetMailboxId) return json({ error: 'targetMailboxId required' }, { status: 400 });
				await moveEmail(client, accountId, emailId, targetMailboxId, sourceMailboxId);
				break;
			}
			default:
				return json({ error: `Unknown action: ${action}` }, { status: 400 });
		}

		return json({ success: true });
	} catch (err) {
		return json({ error: err instanceof Error ? err.message : 'Action failed' }, { status: 500 });
	}
};

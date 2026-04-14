import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '$lib/jmap/auth';
import { markEmail, trashEmail, archiveEmail, spamEmail } from '$lib/jmap/email';
import { getMailboxes, ensureArchiveMailbox } from '$lib/jmap/mailbox';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.auth) return json({ error: 'Not authenticated' }, { status: 401 });

	const body = await request.json();
	const ids = body.ids as string[];
	const action = body.action as string;
	const sourceMailboxId = body.sourceMailboxId as string | undefined;

	if (!ids?.length) return json({ error: 'No email IDs provided' }, { status: 400 });

	try {
		const client = createClient(locals.auth);
		const { accountId } = locals.auth;

		let targetMailboxId: string | undefined;

		if (action === 'trash' || action === 'spam') {
			const mailboxes = await getMailboxes(client, accountId);
			const target = mailboxes.find((m) => m.role === (action === 'trash' ? 'trash' : 'junk'));
			if (!target) return json({ error: `${action} folder not found` }, { status: 500 });
			targetMailboxId = target.id;
		} else if (action === 'archive') {
			targetMailboxId = await ensureArchiveMailbox(client, accountId);
		}

		await Promise.all(
			ids.map((id) => {
				switch (action) {
					case 'markRead':
						return markEmail(client, accountId, id, true);
					case 'markUnread':
						return markEmail(client, accountId, id, false);
					case 'trash':
						return trashEmail(client, accountId, id, sourceMailboxId ?? '', targetMailboxId!);
					case 'archive':
						return archiveEmail(client, accountId, id, sourceMailboxId ?? '', targetMailboxId!);
					case 'spam':
						return spamEmail(client, accountId, id, sourceMailboxId ?? '', targetMailboxId!);
					default:
						throw new Error(`Unknown action: ${action}`);
				}
			})
		);

		return json({ success: true });
	} catch (err) {
		return json({ error: err instanceof Error ? err.message : 'Bulk action failed' }, { status: 500 });
	}
};

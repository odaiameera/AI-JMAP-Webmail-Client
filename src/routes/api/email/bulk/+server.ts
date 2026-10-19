import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '$lib/jmap/auth';
import {
	markEmail,
	trashEmail,
	archiveEmail,
	moveEmails,
	markManyAsSpam,
	markManyAsNotSpam,
	destroyEmail,
	setEmailCategory
} from '$lib/jmap/email';
import { getMailboxes, ensureArchiveMailbox } from '$lib/jmap/mailbox';
import { isInboxCategory } from '$lib/types/categories';
import { recordCorrections } from '$lib/server/db/queries/jev-decisions';
import { forgetSenderMoves, getPinCategory, recordSenderMoves } from '$lib/server/db/queries/jev-learning';
import { getJevSettings } from '$lib/server/db/queries/jev-settings';
import { normalizeAddress } from '$lib/server/trust-sender';
import type { JMAPClient } from '$lib/jmap/client';

/** The sender of each email, lowercased; emails without one are left out. */
async function sendersOf(client: JMAPClient, accountId: string, ids: string[]): Promise<string[]> {
	const response = await client.request([['Email/get', { accountId, ids, properties: ['from'] }, 'g']]);
	const list = (response.methodResponses[0][1] as { list?: { from?: { email?: string }[] | null }[] }).list ?? [];
	return list.map((e) => normalizeAddress(e.from?.[0]?.email ?? '')).filter((a) => a.includes('@'));
}

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

		// Batched Email/set actions: moveTo, spam, notSpam — one round trip.
		if (action === 'moveTo') {
			const target = body.targetMailboxId as string | undefined;
			if (!target) return json({ error: 'targetMailboxId required' }, { status: 400 });
			await moveEmails(client, accountId, ids, target, sourceMailboxId);
			return json({ success: true });
		}

		// Inbox tab: keywords only, so the messages stay where they are.
		if (action === 'setCategory') {
			if (!isInboxCategory(body.category)) {
				return json({ error: 'invalid category' }, { status: 400 });
			}
			await setEmailCategory(client, accountId, ids, body.category);
			const account = locals.activeAccountId;
			if (!account) return json({ success: true, pinSuggestion: null });

			// Where Jev had sorted any of these, note that you moved them —
			// it's how Settings shows how often Jev's picks get corrected.
			recordCorrections(account, ids, body.category);
			// And where you move each sender's mail, which Jev is told next time.
			// Undo takes its move back out instead of adding one.
			const senders = await sendersOf(client, accountId, ids).catch(() => []);
			if (isInboxCategory(body.undoOf)) {
				forgetSenderMoves(account, senders, body.undoOf);
				return json({ success: true, pinSuggestion: null });
			}
			recordSenderMoves(account, senders, body.category);

			// All from one sender: offer to pin it, so Jev never has to guess again.
			const unique = [...new Set(senders)];
			const pinSuggestion =
				unique.length === 1 &&
				getJevSettings(account).jevEnabled &&
				getPinCategory(account, unique[0]) !== body.category
					? { sender: unique[0], category: body.category }
					: null;
			return json({ success: true, pinSuggestion });
		}

		if (action === 'spam') {
			const mailboxes = await getMailboxes(client, accountId);
			const junk = mailboxes.find((m) => m.role === 'junk');
			if (!junk) return json({ error: 'Junk folder not found' }, { status: 500 });
			await markManyAsSpam(client, accountId, ids, sourceMailboxId ?? '', junk.id);
			return json({ success: true });
		}

		if (action === 'notSpam') {
			const mailboxes = await getMailboxes(client, accountId);
			const junk = mailboxes.find((m) => m.role === 'junk');
			const inbox = mailboxes.find((m) => m.role === 'inbox');
			if (!junk || !inbox) return json({ error: 'Inbox or Junk missing' }, { status: 500 });
			await markManyAsNotSpam(client, accountId, ids, junk.id, inbox.id);
			return json({ success: true });
		}

		if (action === 'trash') {
			const mailboxes = await getMailboxes(client, accountId);
			const trash = mailboxes.find((m) => m.role === 'trash');
			if (!trash) return json({ error: 'Trash folder not found' }, { status: 500 });
			const trashId = trash.id;

			await Promise.all(
				ids.map((id) =>
					sourceMailboxId === trashId
						? destroyEmail(client, accountId, id)
						: trashEmail(client, accountId, id, sourceMailboxId ?? '', trashId)
				)
			);
			return json({ success: true });
		}

		let targetMailboxId: string | undefined;
		if (action === 'archive') {
			targetMailboxId = await ensureArchiveMailbox(client, accountId);
		}

		await Promise.all(
			ids.map((id) => {
				switch (action) {
					case 'markRead':
						return markEmail(client, accountId, id, true);
					case 'markUnread':
						return markEmail(client, accountId, id, false);
					case 'archive':
						return archiveEmail(client, accountId, id, sourceMailboxId ?? '', targetMailboxId!);
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

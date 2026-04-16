import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createClient } from '$lib/jmap/auth';
import { queryAndFetchEmails } from '$lib/jmap/email';
import { mailboxDisplayName } from '$lib/utils/mailbox-display';

export const load: PageServerLoad = async ({ locals, params, parent }) => {
	if (!locals.auth) {
		redirect(303, '/login');
	}

	const client = createClient(locals.auth);
	const { mailboxes, labels } = await parent();

	const mailbox = mailboxes.find((m) => m.id === params.id);
	if (!mailbox) {
		return { emails: [], total: 0, mailboxName: 'Unknown', mailboxId: params.id, unreadCount: 0 };
	}

	const result = await queryAndFetchEmails(client, locals.auth.accountId, mailbox.id, { limit: 50 });

	return {
		emails: result.emails,
		total: result.total,
		mailboxName: mailboxDisplayName(mailbox, labels),
		mailboxId: mailbox.id,
		unreadCount: mailbox.unreadEmails
	};
};

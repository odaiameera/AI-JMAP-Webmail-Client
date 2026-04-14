import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createClient } from '$lib/jmap/auth';
import { queryAndFetchEmails } from '$lib/jmap/email';
import { getMailboxes } from '$lib/jmap/mailbox';

export const load: PageServerLoad = async ({ locals, parent }) => {
	if (!locals.auth) {
		redirect(303, '/login');
	}

	const client = createClient(locals.auth);
	const { mailboxes } = await parent();

	const inbox = mailboxes.find((m) => m.role === 'inbox');
	if (!inbox) {
		return { emails: [], total: 0, mailboxId: '' };
	}

	const result = await queryAndFetchEmails(client, locals.auth.accountId, inbox.id, { limit: 50 });

	return {
		emails: result.emails,
		total: result.total,
		mailboxId: inbox.id
	};
};

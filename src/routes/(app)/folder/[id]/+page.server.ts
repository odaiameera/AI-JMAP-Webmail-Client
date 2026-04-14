import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createClient } from '$lib/jmap/auth';
import { queryAndFetchEmails } from '$lib/jmap/email';

export const load: PageServerLoad = async ({ locals, params, parent }) => {
	if (!locals.auth) {
		redirect(303, '/login');
	}

	const client = createClient(locals.auth);
	const { mailboxes } = await parent();

	const mailbox = mailboxes.find((m) => m.id === params.id);
	if (!mailbox) {
		return { emails: [], total: 0, mailboxName: 'Unknown' };
	}

	const result = await queryAndFetchEmails(client, locals.auth.accountId, mailbox.id, { limit: 50 });

	return {
		emails: result.emails,
		total: result.total,
		mailboxName: mailbox.name,
		mailboxId: mailbox.id
	};
};

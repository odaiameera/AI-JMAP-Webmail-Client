import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { createClient } from '$lib/jmap/auth';
import { getMailboxes } from '$lib/jmap/mailbox';
import { JMAPAuthError } from '$lib/jmap/client';
import { deleteSession } from '$lib/server/session';

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
	if (!locals.auth) {
		redirect(303, '/login');
	}

	try {
		const client = createClient(locals.auth);
		const mailboxes = await getMailboxes(client, locals.auth.accountId);

		const decoded = Buffer.from(locals.auth.authHeader.replace('Basic ', ''), 'base64').toString();
		const userEmail = decoded.split(':')[0];

		const readingPane = cookies.get('reading_pane') ?? 'on';
		const theme = cookies.get('theme') ?? 'dark';
		const displayName = cookies.get('display_name') ?? 'Odai Ameera';
		const rawSignature = cookies.get('signature');
		const signature = rawSignature ? decodeURIComponent(rawSignature) : '';

		const rawLabels = cookies.get('mail_labels');
		const labels = rawLabels ? JSON.parse(decodeURIComponent(rawLabels)) : [];

		const rawRules = cookies.get('mail_rules');
		const rules = rawRules ? JSON.parse(decodeURIComponent(rawRules)) : [];

		return {
			mailboxes,
			accountId: locals.auth.accountId,
			userEmail,
			readingPaneDefault: readingPane === 'on',
			theme,
			displayName,
			signature,
			labels,
			rules
		};
	} catch (err) {
		if (err instanceof JMAPAuthError) {
			const sessionId = cookies.get('session');
			if (sessionId) deleteSession(sessionId);
			cookies.delete('session', { path: '/' });
			redirect(303, '/login');
		}
		throw err;
	}
};

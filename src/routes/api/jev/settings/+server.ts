import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listAccounts } from '$lib/server/auth/accounts';
import { updateJevSettings } from '$lib/server/db/queries/jev-settings';

/** Change one linked account's Jev settings. */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Not signed in');

	let body: { accountId?: unknown; inboxTabs?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	// The account must be one of this login's own linked mailboxes.
	const accountId = typeof body.accountId === 'string' ? body.accountId : '';
	if (!listAccounts(locals.user.id).some((a) => a.id === accountId)) {
		return json({ error: 'Unknown account' }, { status: 404 });
	}

	if (typeof body.inboxTabs !== 'boolean') {
		return json({ error: 'inboxTabs must be true or false' }, { status: 400 });
	}

	const settings = updateJevSettings(accountId, { inboxTabs: body.inboxTabs });
	return json({ success: true, settings });
};

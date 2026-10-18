import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listAccounts } from '$lib/server/auth/accounts';
import { updateJevSettings, type JevSettings } from '$lib/server/db/queries/jev-settings';
import { jevMode } from '$lib/server/jev/client';

/** Change one linked account's Jev settings: `inboxTabs` and/or `jevEnabled`. */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Not signed in');

	let body: { accountId?: unknown; inboxTabs?: unknown; jevEnabled?: unknown };
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

	const patch: Partial<JevSettings> = {};
	for (const key of ['inboxTabs', 'jevEnabled'] as const) {
		if (body[key] === undefined) continue;
		if (typeof body[key] !== 'boolean') {
			return json({ error: `${key} must be true or false` }, { status: 400 });
		}
		patch[key] = body[key];
	}
	if (Object.keys(patch).length === 0) {
		return json({ error: 'Nothing to change' }, { status: 400 });
	}
	// Switching Jev on is consent to send this account's new mail to
	// TypeSafe, which only means something once a key is configured.
	if (patch.jevEnabled === true && jevMode() === 'off') {
		return json({ error: 'Jev isn’t configured on this server' }, { status: 409 });
	}

	const settings = updateJevSettings(accountId, patch);
	return json({ success: true, settings: { inboxTabs: settings.inboxTabs, jevEnabled: settings.jevEnabled } });
};

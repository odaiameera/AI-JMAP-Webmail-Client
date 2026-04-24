import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '$lib/jmap/auth';
import { getIdentities } from '$lib/jmap/identities';
import { syncIdentities } from '$lib/server/db/queries/identities';
import { userEmailFromAuth } from '$lib/server/user';

/**
 * Refresh the cached identity set from Stalwart. Called from the Settings
 * page's "Refresh identities" button. The (app) layout already syncs on
 * every navigation; this gives the user a way to trigger an out-of-band
 * refresh without reloading the whole page.
 */
export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.auth) return json({ error: 'Unauthorized' }, { status: 401 });
	const userEmail = userEmailFromAuth(locals.auth);

	try {
		const client = createClient(locals.auth);
		const remote = await getIdentities(client, locals.auth.accountId);

		// Mark the identity matching the user's login email as primary; if
		// none match (shouldn't happen with Stalwart but be defensive),
		// the first one wins so the composer always has a sane default.
		const primaryByEmail = remote.find((r) => r.email.toLowerCase() === userEmail.toLowerCase());
		const primaryId = primaryByEmail?.id ?? remote[0]?.id;

		const upserts = remote.map((r) => ({
			jmapId: r.id,
			email: r.email,
			name: r.name,
			replyTo: r.replyTo,
			isPrimary: r.id === primaryId
		}));

		const cached = syncIdentities(userEmail, upserts);
		return json(cached);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Sync failed';
		return json({ error: message }, { status: 500 });
	}
};

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { userEmailFromAuth } from '$lib/server/user';
import { listIdentities } from '$lib/server/db/queries/identities';

/**
 * Read the cached identity set for the current user. The (app) layout
 * load() refreshes this cache on every navigation, so callers get a
 * recent view without paying a JMAP round-trip per request.
 */
export const GET: RequestHandler = ({ locals }) => {
	if (!locals.auth) return json({ error: 'Unauthorized' }, { status: 401 });
	const email = userEmailFromAuth(locals.auth);
	return json(listIdentities(email));
};

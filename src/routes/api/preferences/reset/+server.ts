import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resetPreferences, PREF_KEYS } from '$lib/server/preferences';

/**
 * Clear every stored preference, plus any legacy cookie still lying around.
 * Session auth, identity (name and avatar) and mail data are not touched.
 */
export const POST: RequestHandler = async ({ cookies, locals }) => {
	if (!locals.user) error(401, 'Not signed in');
	resetPreferences(locals.user.id, cookies);
	return json({ success: true, cleared: PREF_KEYS.length });
};

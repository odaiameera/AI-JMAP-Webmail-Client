import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { PREF_COOKIE_KEYS, deletePref } from '$lib/server/prefs';

/** Clear every preference cookie the app writes. Session auth is not touched. */
export const POST: RequestHandler = async ({ cookies }) => {
	for (const key of PREF_COOKIE_KEYS) {
		deletePref(cookies, key);
	}
	return json({ success: true, cleared: PREF_COOKIE_KEYS.length });
};

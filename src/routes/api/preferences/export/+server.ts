import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exportPrefs } from '$lib/server/prefs';

/** Export every known preference cookie as a JSON blob the user can back up. */
export const GET: RequestHandler = async ({ cookies }) => {
	const prefs = exportPrefs(cookies);
	const payload = {
		version: 1,
		exportedAt: new Date().toISOString(),
		prefs
	};
	return json(payload, {
		headers: {
			'Content-Disposition': 'attachment; filename="ameera-preferences.json"'
		}
	});
};

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exportPreferences } from '$lib/server/preferences';

/** Export every stored preference as a JSON blob the user can back up. */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) error(401, 'Not signed in');
	const payload = {
		version: 1,
		exportedAt: new Date().toISOString(),
		prefs: exportPreferences(locals.user.id)
	};
	return json(payload, {
		headers: {
			'Content-Disposition': 'attachment; filename="ameera-preferences.json"'
		}
	});
};

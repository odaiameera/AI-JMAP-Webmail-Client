import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { importPreferences, PREF_KEYS } from '$lib/server/preferences';

/**
 * Restore preferences from an export payload. Only known keys are honoured;
 * everything else is dropped so a stale or tampered export can't write
 * arbitrary keys into the stored blob.
 */
export const POST: RequestHandler = async ({ request, cookies, locals }) => {
	if (!locals.user) error(401, 'Not signed in');

	let body: { version?: number; prefs?: Record<string, unknown> };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return json({ error: 'Invalid JSON payload' }, { status: 400 });
	}

	if (!body?.prefs || typeof body.prefs !== 'object') {
		return json({ error: 'Missing prefs object' }, { status: 400 });
	}

	const known = new Set<string>(PREF_KEYS);
	const imported = Object.entries(body.prefs).filter(
		([key, value]) => known.has(key) && typeof value === 'string'
	).length;

	importPreferences(locals.user.id, body.prefs, cookies);

	return json({ success: true, imported });
};

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { PREF_COOKIE_KEYS, PREF_COOKIE_OPTIONS } from '$lib/server/prefs';

/**
 * Restore preferences from an export payload. Only the keys we know
 * about are honored; everything else is dropped to avoid cookie
 * injection through a stale / tampered export.
 */
export const POST: RequestHandler = async ({ request, cookies }) => {
	let body: { version?: number; prefs?: Record<string, string> };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return json({ error: 'Invalid JSON payload' }, { status: 400 });
	}

	if (!body?.prefs || typeof body.prefs !== 'object') {
		return json({ error: 'Missing prefs object' }, { status: 400 });
	}

	const known = new Set<string>(PREF_COOKIE_KEYS);
	let imported = 0;
	for (const [key, value] of Object.entries(body.prefs)) {
		if (!known.has(key)) continue;
		if (typeof value !== 'string') continue;
		cookies.set(key, value, PREF_COOKIE_OPTIONS);
		imported++;
	}

	return json({ success: true, imported });
};

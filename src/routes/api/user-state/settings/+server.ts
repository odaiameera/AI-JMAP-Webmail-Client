import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getDisplayName,
	getPrefs,
	patchPrefs,
	setDisplayName
} from '$lib/server/db/queries/app-prefs';

/**
 * The person's name and preference map. Both are keyed to the webmail login,
 * so they are identical across linked accounts and across browsers.
 *
 * The response keeps its original `{ displayName, settings }` shape — the
 * client's `userState` store reads it unchanged.
 */
function snapshot(userId: string) {
	return { displayName: getDisplayName(userId), settings: getPrefs(userId) };
}

export const GET: RequestHandler = ({ locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	return json(snapshot(locals.user.id));
};

export const PATCH: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const body = (await request.json().catch(() => null)) as
		| { displayName?: string; settings?: Record<string, unknown> }
		| null;
	if (!body || typeof body !== 'object') {
		return json({ error: 'Invalid body' }, { status: 400 });
	}

	if (typeof body.displayName === 'string') {
		if (body.displayName.length > 120) {
			return json({ error: 'Name is too long' }, { status: 400 });
		}
		setDisplayName(locals.user.id, body.displayName.trim());
	}
	if (body.settings && typeof body.settings === 'object') {
		// Preferences are stored as strings, matching the cookie shape they
		// replaced; coerce so a numeric page size round-trips cleanly.
		const patch: Record<string, string> = {};
		for (const [key, value] of Object.entries(body.settings)) {
			if (value !== null && value !== undefined) patch[key] = String(value);
		}
		patchPrefs(locals.user.id, patch);
	}

	return json(snapshot(locals.user.id));
};

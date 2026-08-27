import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setDisplayName } from '$lib/server/db/queries/app-prefs';

/**
 * The person's own display name. A first-class column rather than a
 * preference key, and keyed to the webmail login — so it is the same name
 * whichever mail account is active, and it follows you to a new browser.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Not signed in');
	const { displayName } = (await request.json()) as { displayName?: string };

	if (typeof displayName === 'string') {
		if (displayName.length > 120) return json({ error: 'Name is too long' }, { status: 400 });
		setDisplayName(locals.user.id, displayName.trim());
	}

	return json({ success: true });
};

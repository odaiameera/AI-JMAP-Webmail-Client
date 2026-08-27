import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { writePreferences } from '$lib/server/preferences';

/**
 * Theme is the one preference that is also a cookie. SQLite owns the value;
 * `writePreferences` mirrors it so the inline script in app.html can pick the
 * theme before the page paints and avoid a flash of the wrong one.
 */
export const POST: RequestHandler = async ({ request, cookies, locals }) => {
	if (!locals.user) error(401, 'Not signed in');
	const { value } = (await request.json()) as { value?: string };
	if (value !== 'dark' && value !== 'light') {
		return json({ error: 'value must be dark or light' }, { status: 400 });
	}
	writePreferences(locals.user.id, { theme: value }, cookies);
	return json({ success: true });
};

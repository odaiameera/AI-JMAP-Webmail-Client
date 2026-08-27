import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { writePreferences } from '$lib/server/preferences';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Not signed in');
	const { value } = (await request.json()) as { value?: string };
	if (value !== 'on' && value !== 'off') {
		return json({ error: 'value must be on or off' }, { status: 400 });
	}
	writePreferences(locals.user.id, { reading_pane: value });
	return json({ success: true });
};

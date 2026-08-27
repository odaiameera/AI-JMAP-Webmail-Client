import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { writePreferences } from '$lib/server/preferences';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Not signed in');
	const { value } = (await request.json()) as { value: string };
	if (value !== 'compact' && value !== 'comfortable') {
		return json({ error: 'value must be compact or comfortable' }, { status: 400 });
	}
	writePreferences(locals.user.id, { density: value });
	return json({ success: true });
};

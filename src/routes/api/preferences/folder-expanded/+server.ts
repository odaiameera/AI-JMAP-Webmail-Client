import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { writePreferences } from '$lib/server/preferences';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Not signed in');
	const { value } = (await request.json()) as { value: Record<string, boolean> };

	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return json({ error: 'value must be an object' }, { status: 400 });
	}

	writePreferences(locals.user.id, { folder_expanded: JSON.stringify(value) });
	return json({ success: true });
};

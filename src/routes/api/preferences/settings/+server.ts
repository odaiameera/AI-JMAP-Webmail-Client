import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setPref } from '$lib/server/prefs';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const { displayName } = (await request.json()) as { displayName?: string };

	if (typeof displayName === 'string') {
		setPref(cookies, 'display_name', displayName);
	}

	return json({ success: true });
};

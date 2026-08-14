import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setPref } from '$lib/server/prefs';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const { value } = (await request.json()) as { value: string };
	if (value !== 'compact' && value !== 'comfortable') {
		return json({ error: 'value must be compact or comfortable' }, { status: 400 });
	}
	setPref(cookies, 'density', value);
	return json({ success: true });
};

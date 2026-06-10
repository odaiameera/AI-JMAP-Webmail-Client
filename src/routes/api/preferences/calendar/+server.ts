import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setPref } from '$lib/server/prefs';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const body = (await request.json().catch(() => null)) as { weekStart?: number } | null;
	if (!body) return json({ error: 'Invalid body' }, { status: 400 });

	if (body.weekStart !== undefined) {
		if (![0, 1, 6].includes(body.weekStart)) {
			return json({ error: 'weekStart must be 0 (Sun), 1 (Mon) or 6 (Sat)' }, { status: 400 });
		}
		setPref(cookies, 'calendar_week_start', String(body.weekStart));
	}
	return json({ success: true });
};

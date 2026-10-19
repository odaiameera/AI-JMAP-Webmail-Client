import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { writePreferences } from '$lib/server/preferences';
import { isCalendarView } from '$lib/calendar/types';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Not signed in');
	const body = (await request.json().catch(() => null)) as { weekStart?: number; view?: string } | null;
	if (!body) return json({ error: 'Invalid body' }, { status: 400 });

	if (body.weekStart !== undefined) {
		if (![0, 1, 6].includes(body.weekStart)) {
			return json({ error: 'weekStart must be 0 (Sun), 1 (Mon) or 6 (Sat)' }, { status: 400 });
		}
		writePreferences(locals.user.id, { calendar_week_start: String(body.weekStart) });
	}
	if (body.view !== undefined) {
		if (!isCalendarView(body.view)) return json({ error: 'Unknown view' }, { status: 400 });
		writePreferences(locals.user.id, { calendar_view: body.view });
	}
	return json({ success: true });
};

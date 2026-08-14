import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { userEmailFromAuth } from '$lib/server/user';
import { listCalendarsWithMeta } from '$lib/server/calendar/service';
import { createCalendar, CalDAVError } from '$lib/server/calendar/caldav';
import { upsertCalendarMeta } from '$lib/server/db/queries/calendar-meta';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.auth) return json({ error: 'Unauthorized' }, { status: 401 });
	const userEmail = userEmailFromAuth(locals.auth);
	try {
		const calendars = await listCalendarsWithMeta(locals.auth, userEmail);
		return json({ calendars });
	} catch (err) {
		const status = err instanceof CalDAVError ? err.status : 502;
		return json({ error: 'Failed to list calendars' }, { status });
	}
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.auth) return json({ error: 'Unauthorized' }, { status: 401 });
	const userEmail = userEmailFromAuth(locals.auth);

	const body = (await request.json().catch(() => null)) as { name?: string; color?: string } | null;
	const name = body?.name?.trim();
	if (!name) return json({ error: 'Name is required' }, { status: 400 });
	if (name.length > 100) return json({ error: 'Name too long' }, { status: 400 });

	// Collection id: readable slug + entropy so renames never collide.
	const slug =
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 40) || 'calendar';
	const id = `${slug}-${Math.random().toString(36).slice(2, 8)}`;

	try {
		await createCalendar(locals.auth, userEmail, id, name);
		if (body?.color) upsertCalendarMeta(userEmail, id, { color: body.color });
		return json({ success: true, id });
	} catch (err) {
		const status = err instanceof CalDAVError ? err.status : 502;
		return json({ error: 'Failed to create calendar' }, { status });
	}
};

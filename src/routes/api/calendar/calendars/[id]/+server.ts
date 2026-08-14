import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { userEmailFromAuth } from '$lib/server/user';
import { deleteCalendar, renameCalendar, CalDAVError } from '$lib/server/calendar/caldav';
import { deleteCalendarMeta, upsertCalendarMeta } from '$lib/server/db/queries/calendar-meta';

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.auth) return json({ error: 'Unauthorized' }, { status: 401 });
	const userEmail = userEmailFromAuth(locals.auth);
	const calendarId = params.id;

	const body = (await request.json().catch(() => null)) as {
		name?: string;
		color?: string;
		hidden?: boolean;
	} | null;
	if (!body) return json({ error: 'Invalid body' }, { status: 400 });

	try {
		if (body.name !== undefined) {
			const name = body.name.trim();
			if (!name) return json({ error: 'Name is required' }, { status: 400 });
			await renameCalendar(locals.auth, userEmail, calendarId, name);
		}
		if (body.color !== undefined || body.hidden !== undefined) {
			upsertCalendarMeta(userEmail, calendarId, {
				color: body.color ?? null,
				hidden: body.hidden ?? null
			});
		}
		return json({ success: true });
	} catch (err) {
		const status = err instanceof CalDAVError ? err.status : 502;
		return json({ error: 'Failed to update calendar' }, { status });
	}
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.auth) return json({ error: 'Unauthorized' }, { status: 401 });
	const userEmail = userEmailFromAuth(locals.auth);
	const calendarId = params.id;

	if (calendarId === 'default') {
		return json({ error: 'The default calendar cannot be deleted' }, { status: 400 });
	}

	try {
		await deleteCalendar(locals.auth, userEmail, calendarId);
		deleteCalendarMeta(userEmail, calendarId);
		return json({ success: true });
	} catch (err) {
		const status = err instanceof CalDAVError ? err.status : 502;
		return json({ error: 'Failed to delete calendar' }, { status });
	}
};

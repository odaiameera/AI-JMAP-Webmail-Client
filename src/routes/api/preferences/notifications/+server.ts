import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { writePreferences } from '$lib/server/preferences';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Not signed in');
	const body = (await request.json()) as {
		enabled?: boolean;
		folders?: string[];
		calendarEvents?: boolean;
		eventReminders?: boolean;
	};

	const patch: Record<string, string> = {};
	if (body.enabled !== undefined) patch.notifications = body.enabled ? 'on' : 'off';
	if (body.folders !== undefined) {
		if (!Array.isArray(body.folders)) {
			return json({ error: 'folders must be an array of ids' }, { status: 400 });
		}
		// Stored as plain JSON — the percent-encoding this needed as a cookie was
		// a transport detail, not part of the value.
		patch.notification_folders = JSON.stringify(body.folders);
	}
	if (body.calendarEvents !== undefined) {
		patch.notify_calendar_events = body.calendarEvents ? 'on' : 'off';
	}
	if (body.eventReminders !== undefined) {
		patch.notify_event_reminders = body.eventReminders ? 'on' : 'off';
	}
	writePreferences(locals.user.id, patch);
	return json({ success: true });
};

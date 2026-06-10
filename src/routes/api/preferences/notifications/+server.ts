import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setPref, setPrefJson } from '$lib/server/prefs';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const body = (await request.json()) as {
		enabled?: boolean;
		folders?: string[];
		calendarEvents?: boolean;
		eventReminders?: boolean;
	};
	if (body.enabled !== undefined) {
		setPref(cookies, 'notifications', body.enabled ? 'on' : 'off');
	}
	if (body.folders !== undefined) {
		if (!Array.isArray(body.folders)) {
			return json({ error: 'folders must be an array of ids' }, { status: 400 });
		}
		setPrefJson(cookies, 'notification_folders', body.folders);
	}
	if (body.calendarEvents !== undefined) {
		setPref(cookies, 'notify_calendar_events', body.calendarEvents ? 'on' : 'off');
	}
	if (body.eventReminders !== undefined) {
		setPref(cookies, 'notify_event_reminders', body.eventReminders ? 'on' : 'off');
	}
	return json({ success: true });
};

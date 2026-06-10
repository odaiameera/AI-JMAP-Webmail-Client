import type { EventWritePayload } from '$lib/calendar/types';
import { isValidTimeZone } from './tz';

/** Validate + normalize a client event payload. Returns an error string on failure. */
export function validatePayload(body: unknown): EventWritePayload | string {
	const p = body as Partial<EventWritePayload> | null;
	if (!p || typeof p !== 'object') return 'Invalid body';
	if (!p.calendarId || typeof p.calendarId !== 'string') return 'calendarId is required';
	if (typeof p.title !== 'string') return 'title is required';
	if (typeof p.start !== 'string' || typeof p.end !== 'string') return 'start/end are required';
	const allDay = !!p.allDay;
	if (allDay) {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(p.start) || !/^\d{4}-\d{2}-\d{2}$/.test(p.end)) {
			return 'All-day events need YYYY-MM-DD start/end';
		}
	} else {
		if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(p.start) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(p.end)) {
			return 'Timed events need YYYY-MM-DDTHH:mm start/end';
		}
		if (!p.timeZone || typeof p.timeZone !== 'string' || !isValidTimeZone(p.timeZone)) {
			return 'A valid IANA timeZone is required';
		}
		if (p.end <= p.start) return 'End must be after start';
	}
	if (p.alarms && (!Array.isArray(p.alarms) || p.alarms.some((a) => typeof a !== 'number' || a < 0))) {
		return 'alarms must be minutes-before numbers';
	}
	if (p.attendees && !Array.isArray(p.attendees)) return 'attendees must be an array';
	return {
		calendarId: p.calendarId,
		title: p.title.slice(0, 500),
		allDay,
		start: p.start,
		end: p.end,
		timeZone: p.timeZone ?? 'UTC',
		description: typeof p.description === 'string' ? p.description.slice(0, 10000) : '',
		location: typeof p.location === 'string' ? p.location.slice(0, 500) : '',
		rrule: p.rrule ?? null,
		alarms: (p.alarms ?? []).slice(0, 5).map((a) => Math.round(a)),
		attendees: (p.attendees ?? [])
			.filter((a) => a && typeof a.email === 'string' && a.email.includes('@'))
			.slice(0, 50),
		status: p.status === 'tentative' || p.status === 'cancelled' ? p.status : 'confirmed'
	};
}

import ICAL from 'ical.js';
import type { AuthState } from '$lib/jmap/types';
import type { CalendarInfo, EventAttendee, EventInstance, RecurrenceRule } from '$lib/calendar/types';
import { expandToInstances, parseIcs } from './ics';
import { wallClockToUtc } from './tz';
import {
	calendarHref,
	getObject,
	hrefToId,
	putObject,
	CalDAVError
} from './caldav';
import { listCalendarsWithMeta } from './service';

/**
 * iMIP (RFC 6047) support: calendar invitations arrive as `text/calendar`
 * MIME parts with METHOD:REQUEST (or CANCEL for retractions). Everything
 * here is deterministic parsing — no inference involved.
 */

export interface InvitationSummary {
	uid: string;
	method: string | null;
	event: {
		title: string;
		allDay: boolean;
		/** First relevant occurrence (next upcoming, else the first). UTC ISO / YYYY-MM-DD. */
		start: string;
		end: string;
		location: string;
		description: string;
		recurring: boolean;
		rrule: RecurrenceRule | null;
	};
	organizer: { email: string; name: string | null } | null;
	attendees: EventAttendee[];
	/** The user's PARTSTAT in the invitation itself (NEEDS-ACTION etc.), if they're an attendee. */
	myStatus: string | null;
}

function pickInstance(instances: EventInstance[]): EventInstance | null {
	if (instances.length === 0) return null;
	const now = Date.now();
	return (
		instances.find((i) => {
			const t = i.allDay ? Date.parse(`${i.start}T00:00:00Z`) : Date.parse(i.start);
			return t >= now - 3600000;
		}) ?? instances[0]
	);
}

/** Parse an invitation ICS into a renderable summary, or null if it has no usable VEVENT. */
export function summarizeInvitation(ics: string, userEmail: string): InvitationSummary | null {
	const parsed = parseIcs(ics);
	const data = parsed.master ?? parsed.overrides[0];
	if (!data || !data.uid) return null;

	// Expand around the event's own start so past events still summarize.
	const startMs = data.allDay
		? Date.UTC(data.startWall.year, data.startWall.month - 1, data.startWall.day)
		: wallClockToUtc(data.startWall, data.tzid);
	const instances = expandToInstances(parsed, 'x', 'x', startMs - 86400000, startMs + 400 * 86400000);
	const inst = pickInstance(instances);
	if (!inst) return null;

	const me = data.attendees.find((a) => a.email.toLowerCase() === userEmail.toLowerCase());

	return {
		uid: data.uid,
		method: parsed.method,
		event: {
			title: data.summary,
			allDay: inst.allDay,
			start: inst.start,
			end: inst.end,
			location: data.location,
			description: data.description,
			recurring: !!data.rruleRaw,
			rrule: data.rrule
		},
		organizer: data.organizer,
		attendees: data.attendees,
		myStatus: me?.partStat?.toUpperCase() ?? (me ? 'NEEDS-ACTION' : null)
	};
}

/**
 * Prepare an invitation for storage on the user's calendar: keep the
 * original bytes (VTIMEZONE, X-props and all) but strip the iTIP METHOD —
 * CalDAV object resources must not carry one (RFC 4791 §4.1) — and patch
 * the user's ATTENDEE PARTSTAT when they RSVP'd.
 */
export function patchInvitationForImport(
	ics: string,
	userEmail: string,
	partStat: string | null
): string | null {
	let comp: ICAL.Component;
	try {
		comp = new ICAL.Component(ICAL.parse(ics));
	} catch {
		return null;
	}
	comp.removeAllProperties('method');

	if (partStat) {
		const wanted = userEmail.toLowerCase();
		for (const vevent of comp.getAllSubcomponents('vevent')) {
			for (const prop of vevent.getAllProperties('attendee')) {
				const value = String(prop.getFirstValue() ?? '').toLowerCase();
				if (value === `mailto:${wanted}` || value === wanted) {
					prop.setParameter('partstat', partStat);
					prop.setParameter('rsvp', 'FALSE');
				}
			}
		}
	}
	return comp.toString();
}

export interface ExistingCopy {
	calendarId: string;
	eventId: string;
	/** The user's PARTSTAT in the stored copy. */
	myStatus: string | null;
}

/** Look for an already-imported copy of `uid` across the user's calendars. */
export async function findExistingCopy(
	auth: AuthState,
	userEmail: string,
	uid: string,
	calendars: CalendarInfo[]
): Promise<ExistingCopy | null> {
	const results = await Promise.all(
		calendars.map(async (cal) => {
			const href = `${calendarHref(userEmail, cal.id)}${encodeURIComponent(uid)}.ics`;
			try {
				const obj = await getObject(auth, href);
				const parsed = parseIcs(obj.ics);
				const data = parsed.master ?? parsed.overrides[0];
				const me = data?.attendees.find((a) => a.email.toLowerCase() === userEmail.toLowerCase());
				return {
					calendarId: cal.id,
					eventId: hrefToId(href),
					myStatus: me?.partStat?.toUpperCase() ?? null
				};
			} catch {
				return null;
			}
		})
	);
	return results.find((r) => r !== null) ?? null;
}

/** Import (or re-import with a new RSVP) an invitation into a calendar. */
export async function importInvitation(
	auth: AuthState,
	userEmail: string,
	ics: string,
	calendarId: string,
	partStat: string | null
): Promise<{ eventId: string; uid: string }> {
	const summary = summarizeInvitation(ics, userEmail);
	if (!summary) throw new CalDAVError('No event found in this file', 422);
	const patched = patchInvitationForImport(ics, userEmail, partStat);
	if (!patched) throw new CalDAVError('Could not parse the calendar file', 422);

	const href = `${calendarHref(userEmail, calendarId)}${encodeURIComponent(summary.uid)}.ics`;
	// Unconditional PUT: updated invitations (SEQUENCE bumps) and RSVP
	// changes overwrite the previous copy by design.
	await putObject(auth, href, patched, undefined);
	return { eventId: hrefToId(href), uid: summary.uid };
}

export { listCalendarsWithMeta };

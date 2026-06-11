import ICAL from 'ical.js';
import type {
	EventAttendee,
	EventInstance,
	EventStatus,
	EventWritePayload,
	RecurrenceRule,
	RRuleWeekday
} from '$lib/calendar/types';
import {
	normalizeTzid,
	parseWallClock,
	utcToWallClock,
	wallClockToIcs,
	wallClockToUtc,
	type WallClock
} from './tz';

/**
 * iCalendar parsing, recurrence expansion and generation.
 *
 * Strategy: VEVENTs are normalized into {@link VEventData} — wall-clock
 * start + IANA zone + duration — and all recurrence math happens in
 * wall-clock space (an ICAL.Recur iterator over zone-naive times). Each
 * occurrence is converted to a UTC instant via Intl at the end. This gives
 * Google/Apple-style DST behavior (a 9am weekly stays 9am local) for any
 * TZID the runtime knows, with or without VTIMEZONE blocks (RFC 7809).
 *
 * Edits regenerate the VCALENDAR from parsed data rather than patching the
 * original text; the representation round-trips every property the UI
 * exposes (plus SEQUENCE/CREATED/TRANSP/CLASS) so edits from other clients
 * keep their essentials.
 */

export interface VEventData {
	uid: string;
	/** Wall key (`YYYYMMDDTHHMMSS` / `YYYYMMDD`) when this VEVENT overrides one occurrence. */
	recurrenceId: string | null;
	summary: string;
	description: string;
	location: string;
	allDay: boolean;
	/** IANA zone of startWall. 'UTC' covers Z-suffixed and floating times. */
	tzid: string;
	startWall: WallClock;
	/** Exact duration for timed events. */
	durationMs: number;
	/** Duration in days for all-day events (end exclusive). */
	durationDays: number;
	rrule: RecurrenceRule | null;
	/** Verbatim RRULE value — iteration source, survives parts the UI doesn't model. */
	rruleRaw: string | null;
	exdates: string[];
	rdates: string[];
	alarms: number[];
	status: EventStatus;
	transp: string | null;
	icalClass: string | null;
	attendees: EventAttendee[];
	organizer: { email: string; name: string | null } | null;
	sequence: number;
	created: string | null;
}

export interface ParsedObject {
	master: VEventData | null;
	overrides: VEventData[];
	/** iTIP METHOD of the enclosing VCALENDAR (REQUEST/REPLY/CANCEL/…), if any. */
	method: string | null;
}

const MAX_OCCURRENCES = 1000;

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function timeToWall(t: ICAL.Time): WallClock {
	return {
		year: t.year,
		month: t.month,
		day: t.day,
		hour: t.hour,
		minute: t.minute,
		second: t.second
	};
}

function wallKey(wc: WallClock, allDay: boolean): string {
	const ics = wallClockToIcs(wc);
	return allDay ? ics.slice(0, 8) : ics;
}

function propZone(prop: ICAL.Property, time: ICAL.Time): string {
	const tzid = prop.getParameter('tzid');
	if (typeof tzid === 'string' && tzid) {
		// Maps Windows/Exchange TZIDs to IANA; unknown zones degrade to UTC
		// rather than crashing the parse.
		return normalizeTzid(tzid) ?? 'UTC';
	}
	// Z-suffixed → utc zone; floating → treat as UTC.
	void time;
	return 'UTC';
}

function recurToRule(recur: ICAL.Recur): RecurrenceRule | null {
	const freq = recur.freq as RecurrenceRule['freq'];
	if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return null;
	const rule: RecurrenceRule = { freq, interval: recur.interval || 1 };

	const parts = (recur as unknown as { parts?: Record<string, unknown[]> }).parts ?? {};
	const byDay = parts['BYDAY'] as string[] | undefined;
	if (byDay?.length) {
		if (freq === 'MONTHLY' && /^-?\d/.test(String(byDay[0]))) {
			rule.byDayOrdinal = String(byDay[0]);
		} else {
			rule.byDay = byDay.map((d) => String(d).replace(/^[+-]?\d+/, '')) as RRuleWeekday[];
		}
	}
	const byMonthDay = parts['BYMONTHDAY'] as number[] | undefined;
	if (byMonthDay?.length && freq === 'MONTHLY') rule.byMonthDay = Number(byMonthDay[0]);

	if (recur.count) rule.count = recur.count;
	if (recur.until) {
		const u = recur.until;
		rule.until = `${String(u.year).padStart(4, '0')}-${String(u.month).padStart(2, '0')}-${String(u.day).padStart(2, '0')}`;
	}
	return rule;
}

function parseVEvent(vevent: ICAL.Component): VEventData | null {
	const dtstartProp = vevent.getFirstProperty('dtstart');
	if (!dtstartProp) return null;
	const start = dtstartProp.getFirstValue() as ICAL.Time;
	if (!start || typeof start !== 'object' || !('year' in start)) return null;

	const allDay = !!start.isDate;
	const tzid = allDay ? 'UTC' : propZone(dtstartProp, start);
	const startWall = timeToWall(start);

	// Duration: explicit DURATION, else DTEND, else RFC 5545 defaults.
	let durationMs = 0;
	let durationDays = 1;
	const durationVal = vevent.getFirstPropertyValue('duration') as ICAL.Duration | null;
	const dtendProp = vevent.getFirstProperty('dtend');
	if (durationVal && typeof durationVal.toSeconds === 'function') {
		const secs = durationVal.toSeconds();
		durationMs = secs * 1000;
		durationDays = Math.max(1, Math.round(secs / 86400));
	} else if (dtendProp) {
		const end = dtendProp.getFirstValue() as ICAL.Time;
		if (allDay) {
			const a = Date.UTC(start.year, start.month - 1, start.day);
			const b = Date.UTC(end.year, end.month - 1, end.day);
			durationDays = Math.max(1, Math.round((b - a) / 86400000));
		} else {
			const endTz = propZone(dtendProp, end);
			durationMs = Math.max(
				0,
				wallClockToUtc(timeToWall(end), endTz) - wallClockToUtc(startWall, tzid)
			);
		}
	}

	// Recurrence
	let rruleRaw: string | null = null;
	let rrule: RecurrenceRule | null = null;
	const rruleVal = vevent.getFirstPropertyValue('rrule') as ICAL.Recur | null;
	if (rruleVal && typeof rruleVal.toString === 'function') {
		rruleRaw = rruleVal.toString();
		rrule = recurToRule(rruleVal);
	}

	const collectDates = (name: string): string[] => {
		const keys: string[] = [];
		for (const prop of vevent.getAllProperties(name)) {
			for (const v of prop.getValues() as ICAL.Time[]) {
				if (v && typeof v === 'object' && 'year' in v) {
					keys.push(wallKey(timeToWall(v), allDay));
				}
			}
		}
		return keys;
	};

	// Alarms — only relative (duration) DISPLAY-style triggers before start.
	const alarms: number[] = [];
	for (const alarm of vevent.getAllSubcomponents('valarm')) {
		const trigger = alarm.getFirstPropertyValue('trigger') as ICAL.Duration | null;
		if (trigger && typeof trigger.toSeconds === 'function') {
			const secs = trigger.toSeconds();
			if (secs <= 0) alarms.push(Math.round(-secs / 60));
		}
	}

	const attendees: EventAttendee[] = [];
	for (const prop of vevent.getAllProperties('attendee')) {
		const raw = String(prop.getFirstValue() ?? '');
		const email = raw.replace(/^mailto:/i, '');
		if (!email) continue;
		const cn = prop.getParameter('cn');
		const partStat = prop.getParameter('partstat');
		const role = prop.getParameter('role');
		attendees.push({
			email,
			name: typeof cn === 'string' ? cn : undefined,
			partStat: typeof partStat === 'string' ? partStat : undefined,
			role: typeof role === 'string' ? role : undefined
		});
	}

	let organizer: VEventData['organizer'] = null;
	const orgProp = vevent.getFirstProperty('organizer');
	if (orgProp) {
		const email = String(orgProp.getFirstValue() ?? '').replace(/^mailto:/i, '');
		const cn = orgProp.getParameter('cn');
		if (email) organizer = { email, name: typeof cn === 'string' ? cn : null };
	}

	const statusRaw = String(vevent.getFirstPropertyValue('status') ?? '').toUpperCase();
	const status: EventStatus =
		statusRaw === 'TENTATIVE' ? 'tentative' : statusRaw === 'CANCELLED' ? 'cancelled' : 'confirmed';

	let recurrenceId: string | null = null;
	const ridProp = vevent.getFirstProperty('recurrence-id');
	if (ridProp) {
		const rid = ridProp.getFirstValue() as ICAL.Time;
		if (rid && typeof rid === 'object' && 'year' in rid) {
			recurrenceId = wallKey(timeToWall(rid), allDay);
		}
	}

	const createdVal = vevent.getFirstPropertyValue('created');
	return {
		uid: String(vevent.getFirstPropertyValue('uid') ?? ''),
		recurrenceId,
		summary: String(vevent.getFirstPropertyValue('summary') ?? ''),
		description: String(vevent.getFirstPropertyValue('description') ?? ''),
		location: String(vevent.getFirstPropertyValue('location') ?? ''),
		allDay,
		tzid,
		startWall,
		durationMs,
		durationDays,
		rrule,
		rruleRaw,
		exdates: collectDates('exdate'),
		rdates: collectDates('rdate'),
		alarms,
		status,
		transp: (vevent.getFirstPropertyValue('transp') as string | null) ?? null,
		icalClass: (vevent.getFirstPropertyValue('class') as string | null) ?? null,
		attendees,
		organizer,
		sequence: Number(vevent.getFirstPropertyValue('sequence') ?? 0) || 0,
		created: (vevent.getFirstPropertyValue('created') as ICAL.Time | null)?.toString
			? String(createdVal)
			: null
	};
}

export function parseIcs(ics: string): ParsedObject {
	let comp: ICAL.Component;
	try {
		comp = new ICAL.Component(ICAL.parse(ics));
	} catch {
		return { master: null, overrides: [], method: null };
	}
	let master: VEventData | null = null;
	const overrides: VEventData[] = [];
	for (const vevent of comp.getAllSubcomponents('vevent')) {
		const data = parseVEvent(vevent);
		if (!data) continue;
		if (data.recurrenceId) overrides.push(data);
		else if (!master) master = data;
	}
	const methodRaw = comp.getFirstPropertyValue('method');
	const method = typeof methodRaw === 'string' && methodRaw ? methodRaw.toUpperCase() : null;
	return { master, overrides, method };
}

// ---------------------------------------------------------------------------
// Expansion
// ---------------------------------------------------------------------------

function wallToStartIso(wc: WallClock, tzid: string, allDay: boolean): { iso: string; utcMs: number } {
	if (allDay) {
		const iso = `${String(wc.year).padStart(4, '0')}-${String(wc.month).padStart(2, '0')}-${String(wc.day).padStart(2, '0')}`;
		return { iso, utcMs: Date.UTC(wc.year, wc.month - 1, wc.day) };
	}
	const utcMs = wallClockToUtc(wc, tzid);
	return { iso: new Date(utcMs).toISOString(), utcMs };
}

function addDaysToWall(wc: WallClock, days: number): WallClock {
	const d = new Date(Date.UTC(wc.year, wc.month - 1, wc.day + days));
	return {
		year: d.getUTCFullYear(),
		month: d.getUTCMonth() + 1,
		day: d.getUTCDate(),
		hour: 0,
		minute: 0,
		second: 0
	};
}

/** Wall key → `YYYY-MM-DD[THH:mm:ss]` (the client-facing recurrenceId form). */
export function keyToIso(key: string): string {
	const d = `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`;
	if (key.length === 8) return d;
	return `${d}T${key.slice(9, 11)}:${key.slice(11, 13)}:${key.slice(13, 15)}`;
}

/** Client recurrenceId → wall key. */
export function isoToKey(iso: string): string {
	return iso.replace(/[-:]/g, '');
}

function instanceFromData(
	data: VEventData,
	id: string,
	calendarId: string,
	startOverride: WallClock | null,
	recurrenceKey: string | null,
	masterRRule: RecurrenceRule | null
): EventInstance {
	const startWall = startOverride ?? data.startWall;
	const { iso: startIso, utcMs: startMs } = wallToStartIso(startWall, data.tzid, data.allDay);
	let endIso: string;
	if (data.allDay) {
		const endWall = addDaysToWall(startWall, data.durationDays);
		endIso = wallToStartIso(endWall, data.tzid, true).iso;
	} else {
		endIso = new Date(startMs + data.durationMs).toISOString();
	}
	return {
		id,
		calendarId,
		uid: data.uid,
		title: data.summary,
		description: data.description,
		location: data.location,
		start: startIso,
		end: endIso,
		allDay: data.allDay,
		recurring: recurrenceKey !== null,
		recurrenceId: recurrenceKey ? keyToIso(recurrenceKey) : null,
		rrule: masterRRule,
		alarms: data.alarms,
		status: data.status,
		attendees: data.attendees,
		organizer: data.organizer?.email ?? null,
		timeZone: data.allDay ? null : data.tzid
	};
}

function dataEndMs(data: VEventData, startWall: WallClock): number {
	if (data.allDay) {
		const end = addDaysToWall(startWall, data.durationDays);
		return Date.UTC(end.year, end.month - 1, end.day);
	}
	return wallClockToUtc(startWall, data.tzid) + data.durationMs;
}

function dataStartMs(data: VEventData, startWall: WallClock): number {
	if (data.allDay) return Date.UTC(startWall.year, startWall.month - 1, startWall.day);
	return wallClockToUtc(startWall, data.tzid);
}

/**
 * Expand one parsed object into renderable instances overlapping
 * [rangeStartMs, rangeEndMs).
 */
export function expandToInstances(
	parsed: ParsedObject,
	id: string,
	calendarId: string,
	rangeStartMs: number,
	rangeEndMs: number
): EventInstance[] {
	const { master, overrides } = parsed;
	const out: EventInstance[] = [];
	const emittedOverrideKeys = new Set<string>();

	if (master) {
		if (!master.rruleRaw && master.rdates.length === 0) {
			// Plain single event.
			const startMs = dataStartMs(master, master.startWall);
			const endMs = dataEndMs(master, master.startWall);
			if (endMs > rangeStartMs && startMs < rangeEndMs) {
				out.push(instanceFromData(master, id, calendarId, null, null, null));
			}
		} else {
			const exdates = new Set(master.exdates);
			const overrideByKey = new Map(overrides.map((o) => [o.recurrenceId as string, o]));

			// Collect occurrence wall clocks: RRULE iterator (UNTIL stripped —
			// enforced below against true UTC instants) plus RDATEs.
			const occurrences = new Map<string, WallClock>();
			const masterKey = wallKey(master.startWall, master.allDay);

			let untilMs = Infinity;
			if (master.rrule?.until) {
				const [y, m, d] = master.rrule.until.split('-').map(Number);
				untilMs = master.allDay
					? Date.UTC(y, m - 1, d) + 86400000
					: wallClockToUtc({ year: y, month: m, day: d, hour: 23, minute: 59, second: 59 }, master.tzid);
			}

			if (master.rruleRaw) {
				try {
					const recur = ICAL.Recur.fromString(master.rruleRaw.replace(/;?UNTIL=[^;]+/i, ''));
					// Re-apply COUNT semantics from the raw rule (kept by fromString).
					// Zone-naive iteration: UTC stands in for "floating" so all
					// comparisons stay in wall-clock space.
					const dtstart = new ICAL.Time(
						{
							year: master.startWall.year,
							month: master.startWall.month,
							day: master.startWall.day,
							hour: master.startWall.hour,
							minute: master.startWall.minute,
							second: master.startWall.second,
							isDate: master.allDay
						},
						ICAL.Timezone.utcTimezone
					);
					const iter = recur.iterator(dtstart);
					let next: ICAL.Time | null;
					let n = 0;
					while ((next = iter.next()) && n < MAX_OCCURRENCES) {
						n++;
						const wc = timeToWall(next);
						const startMs = dataStartMs(master, wc);
						if (startMs > untilMs) break;
						if (startMs >= rangeEndMs) break;
						occurrences.set(wallKey(wc, master.allDay), wc);
					}
				} catch {
					// Unparseable RRULE — fall back to the base occurrence.
					occurrences.set(masterKey, master.startWall);
				}
			} else {
				occurrences.set(masterKey, master.startWall);
			}
			for (const rk of master.rdates) {
				const iso = keyToIso(rk);
				const wc = parseWallClock(iso.length === 10 ? `${iso}T00:00` : iso);
				if (wc) occurrences.set(rk, wc);
			}

			for (const [key, wc] of occurrences) {
				if (exdates.has(key)) continue;
				const override = overrideByKey.get(key);
				const data = override ?? master;
				const startWall = override ? override.startWall : wc;
				const startMs = dataStartMs(data, startWall);
				const endMs = dataEndMs(data, startWall);
				if (endMs <= rangeStartMs || startMs >= rangeEndMs) continue;
				out.push(instanceFromData(data, id, calendarId, startWall, key, master.rrule));
				if (override) emittedOverrideKeys.add(key);
			}

			// Overrides moved into the range from an occurrence outside it.
			for (const o of overrides) {
				const key = o.recurrenceId as string;
				if (emittedOverrideKeys.has(key)) continue;
				const startMs = dataStartMs(o, o.startWall);
				const endMs = dataEndMs(o, o.startWall);
				if (endMs <= rangeStartMs || startMs >= rangeEndMs) continue;
				if (exdates.has(key)) continue;
				out.push(instanceFromData(o, id, calendarId, o.startWall, key, master.rrule));
			}
		}
	} else {
		// Orphan overrides (no master in this object).
		for (const o of overrides) {
			const startMs = dataStartMs(o, o.startWall);
			const endMs = dataEndMs(o, o.startWall);
			if (endMs <= rangeStartMs || startMs >= rangeEndMs) continue;
			out.push(instanceFromData(o, id, calendarId, o.startWall, o.recurrenceId, null));
		}
	}

	return out;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

function escapeText(s: string): string {
	return s
		.replace(/\\/g, '\\\\')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,')
		.replace(/\r?\n/g, '\\n');
}

/** RFC 5545 §3.1 line folding at 74 octets (UTF-8 safe split point). */
function foldLine(line: string): string {
	if (line.length <= 74) return line;
	const parts: string[] = [];
	let rest = line;
	let first = true;
	while (rest.length > (first ? 74 : 73)) {
		const limit = first ? 74 : 73;
		// Avoid splitting a surrogate pair.
		let cut = limit;
		if (/[\uD800-\uDBFF]/.test(rest[cut - 1])) cut -= 1;
		parts.push((first ? '' : ' ') + rest.slice(0, cut));
		rest = rest.slice(cut);
		first = false;
	}
	parts.push((first ? '' : ' ') + rest);
	return parts.join('\r\n');
}

function dtLine(name: string, data: VEventData, wc: WallClock): string {
	if (data.allDay) return `${name};VALUE=DATE:${wallClockToIcs(wc).slice(0, 8)}`;
	if (data.tzid === 'UTC') return `${name}:${wallClockToIcs(wc)}Z`;
	return `${name};TZID=${data.tzid}:${wallClockToIcs(wc)}`;
}

export function buildRRuleString(rule: RecurrenceRule): string {
	const parts = [`FREQ=${rule.freq}`];
	if (rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
	if (rule.byDay?.length) parts.push(`BYDAY=${rule.byDay.join(',')}`);
	if (rule.byDayOrdinal) parts.push(`BYDAY=${rule.byDayOrdinal}`);
	if (rule.byMonthDay) parts.push(`BYMONTHDAY=${rule.byMonthDay}`);
	if (rule.count) parts.push(`COUNT=${rule.count}`);
	else if (rule.until) parts.push(`UNTIL=${rule.until.replace(/-/g, '')}T235959Z`);
	return parts.join(';');
}

function buildVEvent(data: VEventData, dtstamp: string): string[] {
	const lines: string[] = ['BEGIN:VEVENT'];
	lines.push(`UID:${escapeText(data.uid)}`);
	lines.push(`DTSTAMP:${dtstamp}`);
	if (data.recurrenceId) {
		const iso = keyToIso(data.recurrenceId);
		const wc = parseWallClock(iso.length === 10 ? `${iso}T00:00` : iso);
		if (wc) lines.push(dtLine('RECURRENCE-ID', data, wc));
	}
	lines.push(dtLine('DTSTART', data, data.startWall));
	if (data.allDay) {
		lines.push(dtLine('DTEND', data, addDaysToWall(data.startWall, data.durationDays)));
	} else {
		const endUtc = wallClockToUtc(data.startWall, data.tzid) + data.durationMs;
		const endWall = data.tzid === 'UTC' ? utcToWallClock(endUtc, 'UTC') : utcToWallClock(endUtc, data.tzid);
		lines.push(dtLine('DTEND', data, endWall));
	}
	if (data.summary) lines.push(`SUMMARY:${escapeText(data.summary)}`);
	if (data.description) lines.push(`DESCRIPTION:${escapeText(data.description)}`);
	if (data.location) lines.push(`LOCATION:${escapeText(data.location)}`);
	if (data.rruleRaw && !data.recurrenceId) lines.push(`RRULE:${data.rruleRaw}`);
	for (const ex of data.exdates) {
		const iso = keyToIso(ex);
		const wc = parseWallClock(iso.length === 10 ? `${iso}T00:00` : iso);
		if (wc) lines.push(dtLine('EXDATE', data, wc));
	}
	for (const rd of data.rdates) {
		const iso = keyToIso(rd);
		const wc = parseWallClock(iso.length === 10 ? `${iso}T00:00` : iso);
		if (wc) lines.push(dtLine('RDATE', data, wc));
	}
	lines.push(`STATUS:${data.status.toUpperCase()}`);
	if (data.transp) lines.push(`TRANSP:${data.transp}`);
	if (data.icalClass) lines.push(`CLASS:${data.icalClass}`);
	if (data.created) lines.push(`CREATED:${data.created}`);
	lines.push(`SEQUENCE:${data.sequence}`);
	if (data.organizer) {
		const cn = data.organizer.name ? `;CN=${quoteParam(data.organizer.name)}` : '';
		lines.push(`ORGANIZER${cn}:mailto:${data.organizer.email}`);
	}
	for (const a of data.attendees) {
		const params: string[] = [];
		if (a.name) params.push(`CN=${quoteParam(a.name)}`);
		params.push(`ROLE=${a.role ?? 'REQ-PARTICIPANT'}`);
		params.push(`PARTSTAT=${a.partStat ?? 'NEEDS-ACTION'}`);
		params.push('RSVP=TRUE');
		lines.push(`ATTENDEE;${params.join(';')}:mailto:${a.email}`);
	}
	for (const minutes of data.alarms) {
		lines.push('BEGIN:VALARM');
		lines.push('ACTION:DISPLAY');
		lines.push(`DESCRIPTION:${escapeText(data.summary || 'Reminder')}`);
		lines.push(minutes === 0 ? 'TRIGGER:PT0S' : `TRIGGER:-PT${minutes}M`);
		lines.push('END:VALARM');
	}
	lines.push('END:VEVENT');
	return lines;
}

function quoteParam(v: string): string {
	const clean = v.replace(/[\r\n"]/g, '');
	return /[;:,]/.test(clean) ? `"${clean}"` : clean;
}

export function buildIcs(master: VEventData, overrides: VEventData[] = []): string {
	const dtstamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
	const lines: string[] = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//ameera//webmail calendar//EN',
		'CALSCALE:GREGORIAN'
	];
	lines.push(...buildVEvent(master, dtstamp));
	for (const o of overrides) lines.push(...buildVEvent(o, dtstamp));
	lines.push('END:VCALENDAR');
	return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** Map a client write payload onto VEventData. */
export function payloadToData(
	payload: EventWritePayload,
	uid: string,
	base?: Partial<Pick<VEventData, 'sequence' | 'created' | 'recurrenceId' | 'exdates' | 'organizer'>>
): VEventData | null {
	const allDay = payload.allDay;
	let startWall: WallClock | null;
	let durationMs = 0;
	let durationDays = 1;
	const tzid = allDay ? 'UTC' : payload.timeZone || 'UTC';

	if (allDay) {
		startWall = parseWallClock(`${payload.start}T00:00`);
		const endWall = parseWallClock(`${payload.end}T00:00`);
		if (!startWall || !endWall) return null;
		const a = Date.UTC(startWall.year, startWall.month - 1, startWall.day);
		const b = Date.UTC(endWall.year, endWall.month - 1, endWall.day);
		durationDays = Math.max(1, Math.round((b - a) / 86400000));
	} else {
		startWall = parseWallClock(payload.start);
		const endWall = parseWallClock(payload.end);
		if (!startWall || !endWall) return null;
		durationMs = Math.max(0, wallClockToUtc(endWall, tzid) - wallClockToUtc(startWall, tzid));
		if (durationMs === 0) durationMs = 30 * 60 * 1000;
	}

	const rrule = payload.rrule ?? null;
	return {
		uid,
		recurrenceId: base?.recurrenceId ?? null,
		summary: payload.title ?? '',
		description: payload.description ?? '',
		location: payload.location ?? '',
		allDay,
		tzid,
		startWall,
		durationMs,
		durationDays,
		rrule,
		rruleRaw: rrule ? buildRRuleString(rrule) : null,
		exdates: base?.exdates ?? [],
		rdates: [],
		alarms: payload.alarms ?? [],
		status: payload.status ?? 'confirmed',
		transp: null,
		icalClass: null,
		attendees: payload.attendees ?? [],
		organizer: base?.organizer ?? null,
		sequence: base?.sequence ?? 0,
		created: base?.created ?? null
	};
}

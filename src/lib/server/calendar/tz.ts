/**
 * Wall-clock ⇄ UTC conversion backed by the Intl API, so any IANA timezone
 * the runtime knows works without shipping VTIMEZONE data. iCalendar stores
 * recurring events as wall-clock times plus a TZID (RFC 7809 allows the
 * TZID-by-reference form Stalwart emits), and recurrence math must happen in
 * wall-clock space for DST to behave like Google/Apple calendars — a 9am
 * weekly meeting stays 9am local across transitions.
 */

export interface WallClock {
	year: number;
	month: number; // 1-12
	day: number;
	hour: number;
	minute: number;
	second: number;
}

const dtfCache = new Map<string, Intl.DateTimeFormat>();
// Offset lookups repeat heavily during recurrence expansion (same zone,
// nearby instants). Cache per zone+hour-bucket — offsets never change
// mid-hour in the IANA database.
const offsetCache = new Map<string, number>();

function getDtf(timeZone: string): Intl.DateTimeFormat {
	let dtf = dtfCache.get(timeZone);
	if (!dtf) {
		dtf = new Intl.DateTimeFormat('en-US', {
			timeZone,
			hour12: false,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
		dtfCache.set(timeZone, dtf);
	}
	return dtf;
}

export function isValidTimeZone(timeZone: string): boolean {
	try {
		getDtf(timeZone);
		return true;
	} catch {
		return false;
	}
}

/** Milliseconds east of UTC for `timeZone` at the given UTC instant. */
function tzOffsetMs(timeZone: string, utcMs: number): number {
	const bucket = `${timeZone}:${Math.floor(utcMs / 3_600_000)}`;
	const cached = offsetCache.get(bucket);
	if (cached !== undefined) return cached;

	const parts = getDtf(timeZone).formatToParts(new Date(utcMs));
	const v: Record<string, number> = {};
	for (const p of parts) {
		if (p.type !== 'literal') v[p.type] = Number(p.value);
	}
	// Intl can emit hour "24" for midnight.
	const hour = v.hour === 24 ? 0 : v.hour;
	const asUtc = Date.UTC(v.year, v.month - 1, v.day, hour, v.minute, v.second);
	// Compare against the instant truncated to whole seconds — formatToParts
	// has second precision and sub-second drift would corrupt the offset.
	const offset = asUtc - Math.floor(utcMs / 1000) * 1000;
	offsetCache.set(bucket, offset);
	return offset;
}

/**
 * Interpret a wall-clock time in `timeZone` and return the UTC epoch (ms).
 * Two-pass fixed-point handles DST: for skipped local times (spring
 * forward) this lands on the post-transition instant, matching the
 * behavior of major calendar clients.
 */
export function wallClockToUtc(wc: WallClock, timeZone: string): number {
	const naive = Date.UTC(wc.year, wc.month - 1, wc.day, wc.hour, wc.minute, wc.second);
	if (timeZone === 'UTC' || timeZone === 'Etc/UTC' || timeZone === 'Z') return naive;
	let offset = tzOffsetMs(timeZone, naive);
	offset = tzOffsetMs(timeZone, naive - offset);
	return naive - offset;
}

/** Wall-clock fields of a UTC instant as seen in `timeZone`. */
export function utcToWallClock(utcMs: number, timeZone: string): WallClock {
	const parts = getDtf(timeZone).formatToParts(new Date(utcMs));
	const v: Record<string, number> = {};
	for (const p of parts) {
		if (p.type !== 'literal') v[p.type] = Number(p.value);
	}
	return {
		year: v.year,
		month: v.month,
		day: v.day,
		hour: v.hour === 24 ? 0 : v.hour,
		minute: v.minute,
		second: v.second
	};
}

/** `YYYYMMDDTHHMMSS` (iCalendar local form) for a wall clock. */
export function wallClockToIcs(wc: WallClock): string {
	const p = (n: number, w = 2) => String(n).padStart(w, '0');
	return `${p(wc.year, 4)}${p(wc.month)}${p(wc.day)}T${p(wc.hour)}${p(wc.minute)}${p(wc.second)}`;
}

/** Parse `YYYY-MM-DDTHH:mm[:ss]` (payload wall-clock form). */
export function parseWallClock(value: string): WallClock | null {
	const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
	if (!m) return null;
	return {
		year: +m[1],
		month: +m[2],
		day: +m[3],
		hour: +m[4],
		minute: +m[5],
		second: m[6] ? +m[6] : 0
	};
}

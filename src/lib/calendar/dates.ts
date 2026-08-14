/**
 * Date helpers for the calendar views. Everything here operates on *local*
 * `Date` objects (the browser's timezone) — instances arrive from the server
 * as UTC instants and are bucketed into local days for display.
 *
 * "Day key" = `YYYY-MM-DD` in local time; the canonical cell identifier.
 */

/** 0 = Sunday … 6 = Saturday, matching `Date.getDay()`. */
export type WeekStart = 0 | 1 | 6;

export function dayKey(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

/** Parse `YYYY-MM-DD` as a local-midnight Date. */
export function fromDayKey(key: string): Date {
	const [y, m, d] = key.split('-').map(Number);
	return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function isValidDayKey(key: string | null | undefined): key is string {
	return !!key && /^\d{4}-\d{2}-\d{2}$/.test(key) && !isNaN(fromDayKey(key).getTime());
}

export function startOfDay(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function addMonths(d: Date, n: number): Date {
	// Clamp to the last day of the target month so Jan 31 + 1mo = Feb 28/29.
	const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
	const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
	target.setDate(Math.min(d.getDate(), lastDay));
	return target;
}

export function startOfWeek(d: Date, weekStart: WeekStart): Date {
	const day = startOfDay(d);
	const diff = (day.getDay() - weekStart + 7) % 7;
	return addDays(day, -diff);
}

export function sameDay(a: Date, b: Date): boolean {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

/**
 * The 42 cells (6 weeks) shown for a month grid, starting on the week
 * containing the 1st.
 */
export function monthGridDays(year: number, month: number, weekStart: WeekStart): Date[] {
	const first = new Date(year, month, 1);
	const gridStart = startOfWeek(first, weekStart);
	return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

export function weekdayLabels(weekStart: WeekStart): string[] {
	const base = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	return Array.from({ length: 7 }, (_, i) => base[(weekStart + i) % 7]);
}

const MONTHS = [
	'January', 'February', 'March', 'April', 'May', 'June',
	'July', 'August', 'September', 'October', 'November', 'December'
];

export function monthName(month: number): string {
	return MONTHS[month];
}

/** "9:30 AM" / "14:00" style formatting (locale-aware, no seconds). */
export function formatTime(d: Date): string {
	return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatDayLong(d: Date): string {
	return d.toLocaleDateString(undefined, {
		weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
	});
}

/** Wall-clock `YYYY-MM-DDTHH:mm` in local time — the value sent in write payloads. */
export function toLocalWallClock(d: Date): string {
	const h = String(d.getHours()).padStart(2, '0');
	const m = String(d.getMinutes()).padStart(2, '0');
	return `${dayKey(d)}T${h}:${m}`;
}

/** Browser's IANA timezone. */
export function localTimeZone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/**
 * Convert an instance boundary to a local Date. All-day values are bare
 * `YYYY-MM-DD` (timezone-less); timed values are UTC ISO instants.
 */
export function instanceDate(value: string, allDay: boolean): Date {
	return allDay ? fromDayKey(value) : new Date(value);
}

/** Human range label, e.g. "9:00 – 10:30 AM" or "Jun 3 – Jun 5". */
export function formatEventRange(start: Date, end: Date, allDay: boolean): string {
	if (allDay) {
		// `end` is exclusive for all-day events.
		const lastDay = addDays(end, -1);
		if (sameDay(start, lastDay)) {
			return start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
		}
		const opts = { month: 'short', day: 'numeric' } as const;
		return `${start.toLocaleDateString(undefined, opts)} – ${lastDay.toLocaleDateString(undefined, opts)}`;
	}
	if (sameDay(start, end)) {
		return `${start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${formatTime(start)} – ${formatTime(end)}`;
	}
	const opts = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' } as const;
	return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`;
}

import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { getEventsInRange } from '$lib/server/calendar/service';
import { userEmailFromAuth } from '$lib/server/user';
import type { CalendarInfo, EventInstance } from '$lib/calendar/types';

export type CalendarView = 'month' | 'week' | 'workweek' | '3day' | 'day';

const DAY_MS = 86400000;
const VIEWS: CalendarView[] = ['month', 'week', 'workweek', '3day', 'day'];

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
	if (!locals.auth) redirect(303, '/login');

	const viewParam = url.searchParams.get('view') as CalendarView | null;
	const view: CalendarView = viewParam && VIEWS.includes(viewParam) ? viewParam : 'month';

	const dateParam = url.searchParams.get('date');
	let date: string;
	if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) && !isNaN(Date.parse(dateParam))) {
		date = dateParam;
	} else {
		// Server-local today; the client URL always carries an explicit date
		// after the first navigation, so tz skew only affects the very first
		// paint by at most a day.
		date = new Date().toISOString().slice(0, 10);
	}

	const [y, m, d] = date.split('-').map(Number);
	const anchor = Date.UTC(y, m - 1, d);

	// Generous UTC padding: month grids show up to 6 leading / 14 trailing
	// days, and local-day bucketing can shift events ±1 day vs UTC.
	let rangeStart: number;
	let rangeEnd: number;
	if (view === 'month') {
		const monthStart = Date.UTC(y, m - 1, 1);
		const monthEnd = Date.UTC(y, m, 1);
		rangeStart = monthStart - 8 * DAY_MS;
		rangeEnd = monthEnd + 15 * DAY_MS;
	} else if (view === 'week' || view === 'workweek') {
		rangeStart = anchor - 8 * DAY_MS;
		rangeEnd = anchor + 9 * DAY_MS;
	} else if (view === '3day') {
		rangeStart = anchor - 2 * DAY_MS;
		rangeEnd = anchor + 5 * DAY_MS;
	} else {
		rangeStart = anchor - 2 * DAY_MS;
		rangeEnd = anchor + 2 * DAY_MS;
	}

	const weekStartCookie = cookies.get('calendar_week_start');
	const weekStart = weekStartCookie === '0' ? 0 : weekStartCookie === '6' ? 6 : 1;

	const userEmail = userEmailFromAuth(locals.auth);
	let calendars: CalendarInfo[] = [];
	let events: EventInstance[] = [];
	let calendarError = false;
	try {
		const result = await getEventsInRange(locals.auth, userEmail, rangeStart, rangeEnd);
		calendars = result.calendars;
		events = result.events;
	} catch (err) {
		console.warn('[calendar] load failed', err);
		calendarError = true;
	}

	return { calendars, events, view, date, weekStart, calendarError };
};

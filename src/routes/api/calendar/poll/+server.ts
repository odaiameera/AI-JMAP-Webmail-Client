import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { userEmailFromAuth } from '$lib/server/user';
import { pollCalendarChanges, upcomingReminders } from '$lib/server/calendar/service';

/**
 * Notification poll. The client posts the sync tokens it captured last
 * round; the server returns events changed since then (via RFC 6578
 * sync-collection — covers events created from other devices/clients) plus
 * VALARM reminders firing in the next half hour window the client should
 * schedule locally. First poll (no tokens) only establishes a baseline.
 */
const REMINDER_HORIZON_MS = 30 * 60 * 1000;

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.auth) return json({ error: 'Unauthorized' }, { status: 401 });
	const userEmail = userEmailFromAuth(locals.auth);

	const body = (await request.json().catch(() => null)) as {
		tokens?: Record<string, string>;
	} | null;
	const tokens =
		body?.tokens && typeof body.tokens === 'object' ? body.tokens : ({} as Record<string, string>);

	try {
		const [changes, reminders] = await Promise.all([
			pollCalendarChanges(locals.auth, userEmail, tokens),
			upcomingReminders(locals.auth, userEmail, REMINDER_HORIZON_MS)
		]);
		return json({
			tokens: changes.tokens,
			changed: changes.initial ? [] : changes.changed,
			reminders
		});
	} catch {
		return json({ error: 'Poll failed' }, { status: 502 });
	}
};

import type { Handle } from '@sveltejs/kit';
import { getSession } from '$lib/server/session';
import { runMigrations } from '$lib/server/db/migrate';
import {
	startReminderScheduler,
	processDueRemindersForUser
} from '$lib/server/reminder-scheduler';
import { startRulesScheduler, applyRulesForUserSafe } from '$lib/server/rules-scheduler';
import { userEmailFromAuth } from '$lib/server/user';

// Run pending DB migrations once per process lifetime — better-sqlite3 is
// synchronous so no promise-caching is required. Silent by design (the
// spec calls for no log output); failures surface through subsequent
// query errors rather than hot-path noise.
let migrated = false;

// Throttle on-demand reminder checks so we don't hit SQLite on every
// static asset request. Map is process-local; cron handles cross-process
// correctness (there's only ever one node process per container anyway).
const lastDueCheck = new Map<string, number>();
const DUE_CHECK_INTERVAL_MS = 30 * 1000;

// Same idea for the auto-apply rules pass: opportunistic catch-up for active
// users so rules fire within a couple seconds instead of waiting on the cron.
const lastRulesRun = new Map<string, number>();
const RULES_RUN_INTERVAL_MS = 20 * 1000;

export const handle: Handle = async ({ event, resolve }) => {
	if (!migrated) {
		runMigrations();
		startReminderScheduler();
		startRulesScheduler();
		migrated = true;
	}

	const sessionId = event.cookies.get('session');

	if (sessionId) {
		const auth = getSession(sessionId);
		if (auth) {
			event.locals.auth = auth;

			// Opportunistic catch-up: if the cron tick hasn't run yet but a
			// reminder is already past due, process it before the request
			// continues so the user doesn't wait 60s to see their email back.
			const userEmail = userEmailFromAuth(auth);
			const last = lastDueCheck.get(userEmail) ?? 0;
			if (Date.now() - last > DUE_CHECK_INTERVAL_MS) {
				lastDueCheck.set(userEmail, Date.now());
				// Fire and forget — never block the request on this.
				void processDueRemindersForUser(auth, userEmail);
			}

			const lastRules = lastRulesRun.get(userEmail) ?? 0;
			if (Date.now() - lastRules > RULES_RUN_INTERVAL_MS) {
				lastRulesRun.set(userEmail, Date.now());
				void applyRulesForUserSafe(auth, userEmail);
			}
		} else {
			event.cookies.delete('session', { path: '/' });
		}
	}

	return resolve(event);
};

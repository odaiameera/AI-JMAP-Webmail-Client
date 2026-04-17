import type { Handle } from '@sveltejs/kit';
import { getSession } from '$lib/server/session';
import { runMigrations } from '$lib/server/db/migrate';

// Run pending DB migrations once per process lifetime — better-sqlite3 is
// synchronous so no promise-caching is required. Silent by design (the
// spec calls for no log output); failures surface through subsequent
// query errors rather than hot-path noise.
let migrated = false;

export const handle: Handle = async ({ event, resolve }) => {
	if (!migrated) {
		runMigrations();
		migrated = true;
	}

	const sessionId = event.cookies.get('session');

	if (sessionId) {
		const auth = getSession(sessionId);
		if (auth) {
			event.locals.auth = auth;
		} else {
			event.cookies.delete('session', { path: '/' });
		}
	}

	return resolve(event);
};

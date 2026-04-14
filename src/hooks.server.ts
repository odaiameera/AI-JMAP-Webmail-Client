import type { Handle } from '@sveltejs/kit';
import { getSession } from '$lib/server/session';

export const handle: Handle = async ({ event, resolve }) => {
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

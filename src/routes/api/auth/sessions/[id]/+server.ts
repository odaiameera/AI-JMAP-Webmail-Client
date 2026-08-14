import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteAppSession, listSessions } from '$lib/server/auth/app-session';

export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) error(401, 'Not signed in');
	// Only the owner's sessions are revocable from here.
	if (!listSessions(locals.user.id).some((s) => s.id === params.id)) {
		error(404, 'Unknown session');
	}
	deleteAppSession(params.id);
	return json({ success: true });
};

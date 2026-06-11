import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { changePassword } from '$lib/server/auth/user';
import { revokeOtherSessions } from '$lib/server/auth/app-session';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user || !locals.sessionId) error(401, 'Not signed in');

	const { current, next } = (await request.json()) as { current?: string; next?: string };
	if (!current || !next) error(400, 'Current and new password are required');
	if (next.length < 8) error(400, 'New password must be at least 8 characters');

	if (!changePassword(locals.user.id, current, next)) {
		error(403, 'Current password is incorrect');
	}

	// Standard hygiene: a password change signs out every other device.
	revokeOtherSessions(locals.user.id, locals.sessionId);
	return json({ success: true });
};

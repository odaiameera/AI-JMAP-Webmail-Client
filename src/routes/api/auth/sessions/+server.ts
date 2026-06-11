import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listSessions } from '$lib/server/auth/app-session';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) error(401, 'Not signed in');
	return json({
		sessions: listSessions(locals.user.id).map((s) => ({
			id: s.id,
			createdAt: s.created_at,
			lastSeenAt: s.last_seen_at,
			userAgent: s.user_agent,
			ip: s.ip,
			current: s.id === locals.sessionId
		}))
	});
};

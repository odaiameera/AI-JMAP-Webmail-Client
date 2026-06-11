import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listPasskeys } from '$lib/server/auth/passkeys';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) error(401, 'Not signed in');
	return json({
		passkeys: listPasskeys(locals.user.id).map((p) => ({
			id: p.id,
			name: p.name,
			createdAt: p.created_at,
			lastUsedAt: p.last_used_at
		}))
	});
};

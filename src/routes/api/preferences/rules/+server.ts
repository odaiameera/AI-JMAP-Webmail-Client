import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { userEmailFromAuth } from '$lib/server/user';
import { loadRules, saveRules } from '$lib/server/rules-store';

export const GET: RequestHandler = async ({ locals, cookies }) => {
	if (!locals.auth) return json({ error: 'Not authenticated' }, { status: 401 });
	const userEmail = userEmailFromAuth(locals.auth);
	return json({ rules: loadRules(userEmail, cookies) });
};

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	if (!locals.auth) return json({ error: 'Not authenticated' }, { status: 401 });
	const userEmail = userEmailFromAuth(locals.auth);
	const { rules } = await request.json();
	saveRules(userEmail, Array.isArray(rules) ? rules : [], cookies);
	return json({ success: true });
};

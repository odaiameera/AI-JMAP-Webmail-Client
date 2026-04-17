import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { userEmailFromAuth } from '$lib/server/user';
import { getUserSettings, patchSettings, setDisplayName } from '$lib/server/db/queries/user-settings';

export const GET: RequestHandler = ({ locals }) => {
	if (!locals.auth) return json({ error: 'Unauthorized' }, { status: 401 });
	const email = userEmailFromAuth(locals.auth);
	return json(getUserSettings(email));
};

export const PATCH: RequestHandler = async ({ locals, request }) => {
	if (!locals.auth) return json({ error: 'Unauthorized' }, { status: 401 });
	const email = userEmailFromAuth(locals.auth);

	const body = (await request.json().catch(() => null)) as
		| { displayName?: string; settings?: Record<string, unknown> }
		| null;
	if (!body || typeof body !== 'object') {
		return json({ error: 'Invalid body' }, { status: 400 });
	}

	if (typeof body.displayName === 'string') {
		setDisplayName(email, body.displayName);
	}
	if (body.settings && typeof body.settings === 'object') {
		patchSettings(email, body.settings);
	}

	return json(getUserSettings(email));
};

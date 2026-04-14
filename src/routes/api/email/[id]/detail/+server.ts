import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '$lib/jmap/auth';
import { getEmailDetail } from '$lib/jmap/email';

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.auth) return json({ error: 'Not authenticated' }, { status: 401 });

	try {
		const client = createClient(locals.auth);
		const email = await getEmailDetail(client, locals.auth.accountId, params.id);
		return json(email);
	} catch (err) {
		return json({ error: err instanceof Error ? err.message : 'Failed to load email' }, { status: 500 });
	}
};

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '$lib/jmap/auth';
import { destroyEmail } from '$lib/jmap/email';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.auth) return json({ error: 'Not authenticated' }, { status: 401 });

	const body = await request.json();
	if (!body.draftId) return json({ success: true });

	try {
		const client = createClient(locals.auth);
		await destroyEmail(client, locals.auth.accountId, body.draftId);
		return json({ success: true });
	} catch (err) {
		return json({ error: err instanceof Error ? err.message : 'Failed to discard' }, { status: 500 });
	}
};

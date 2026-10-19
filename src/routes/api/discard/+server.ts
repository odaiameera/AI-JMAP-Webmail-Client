import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '$lib/jmap/auth';
import { destroyEmail } from '$lib/jmap/email';
import { parseDraftId } from '$lib/server/compose-input';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.auth) return json({ error: 'Not authenticated' }, { status: 401 });

	const body = await request.json();
	const draftId = parseDraftId(body.draftId);
	if (!draftId) return json({ success: true });

	try {
		const client = createClient(locals.auth);
		// Only ever a draft: this endpoint deletes for good, so it checks the
		// $draft flag rather than trusting whatever id it was handed.
		const response = await client.request([
			['Email/get', { accountId: locals.auth.accountId, ids: [draftId], properties: ['keywords'] }, '0']
		]);
		const [email] = (response.methodResponses[0][1] as { list?: { keywords?: Record<string, boolean> }[] }).list ?? [];
		if (!email) return json({ success: true });
		if (!email.keywords?.$draft) return json({ error: 'Not a draft' }, { status: 400 });

		await destroyEmail(client, locals.auth.accountId, draftId);
		return json({ success: true });
	} catch (err) {
		return json({ error: err instanceof Error ? err.message : 'Failed to discard' }, { status: 500 });
	}
};

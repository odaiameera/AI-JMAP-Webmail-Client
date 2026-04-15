import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '$lib/jmap/auth';

export const POST: RequestHandler = async ({ request, locals, params }) => {
	if (!locals.auth) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	const { labelId, action } = await request.json() as { labelId: string; action: 'apply' | 'remove' };
	const client = createClient(locals.auth);

	await client.request([
		['Email/set', {
			accountId: locals.auth.accountId,
			update: {
				[params.id]: {
					[`keywords/${labelId}`]: action === 'apply' ? true : null
				}
			}
		}, '0']
	]);

	return json({ success: true });
};

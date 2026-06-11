import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { reorderAccounts } from '$lib/server/auth/accounts';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Not signed in');

	const { ids } = (await request.json()) as { ids?: string[] };
	if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
		error(400, 'ids must be an array of account ids');
	}

	reorderAccounts(locals.user.id, ids);
	return json({ success: true });
};

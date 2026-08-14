import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { userEmailFromAuth } from '$lib/server/user';
import { getLabelsForUser } from '$lib/server/db/queries/label-meta';

export const GET: RequestHandler = ({ locals }) => {
	if (!locals.auth) return json({ error: 'Unauthorized' }, { status: 401 });
	const email = userEmailFromAuth(locals.auth);
	return json(getLabelsForUser(email));
};

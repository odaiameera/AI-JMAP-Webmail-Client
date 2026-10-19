import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { userEmailFromAuth } from '$lib/server/user';
import { getFoldersForUser } from '$lib/server/db/queries/folder-meta';
import { lucideNode } from '$lib/server/lucide-icons';

export const GET: RequestHandler = ({ locals }) => {
	if (!locals.auth) return json({ error: 'Unauthorized' }, { status: 401 });
	const email = userEmailFromAuth(locals.auth);
	return json(getFoldersForUser(email).map((f) => ({ ...f, icon: f.icon || null, iconNode: lucideNode(f.icon) })));
};

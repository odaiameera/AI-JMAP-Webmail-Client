import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { userEmailFromAuth } from '$lib/server/user';
import {
	deleteFolderMeta,
	getFolderMeta,
	upsertFolderMeta
} from '$lib/server/db/queries/folder-meta';

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.auth) return json({ error: 'Unauthorized' }, { status: 401 });
	const email = userEmailFromAuth(locals.auth);

	const body = (await request.json().catch(() => null)) as
		| { displayName?: string; color?: string; icon?: string | null }
		| null;
	if (!body) return json({ error: 'Invalid body' }, { status: 400 });

	upsertFolderMeta(email, params.id, {
		displayName: body.displayName,
		color: body.color,
		icon: body.icon
	});

	return json(getFolderMeta(email, params.id));
};

export const DELETE: RequestHandler = ({ locals, params }) => {
	if (!locals.auth) return json({ error: 'Unauthorized' }, { status: 401 });
	const email = userEmailFromAuth(locals.auth);
	deleteFolderMeta(email, params.id);
	return json({ success: true });
};

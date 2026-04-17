import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { userEmailFromAuth } from '$lib/server/user';
import {
	deleteLabelMeta,
	getLabelMeta,
	upsertLabelMeta
} from '$lib/server/db/queries/label-meta';

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.auth) return json({ error: 'Unauthorized' }, { status: 401 });
	const email = userEmailFromAuth(locals.auth);

	const body = (await request.json().catch(() => null)) as
		| { displayName?: string; color?: string }
		| null;
	if (!body) return json({ error: 'Invalid body' }, { status: 400 });

	upsertLabelMeta(email, params.id, {
		displayName: body.displayName,
		color: body.color
	});

	return json(getLabelMeta(email, params.id));
};

export const DELETE: RequestHandler = ({ locals, params }) => {
	if (!locals.auth) return json({ error: 'Unauthorized' }, { status: 401 });
	const email = userEmailFromAuth(locals.auth);
	deleteLabelMeta(email, params.id);
	return json({ success: true });
};

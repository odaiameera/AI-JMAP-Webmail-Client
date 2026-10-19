import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { userEmailFromAuth } from '$lib/server/user';
import {
	deleteLabelMeta,
	getLabelMeta,
	upsertLabelMeta
} from '$lib/server/db/queries/label-meta';
import { lucideNode, parseIconPatch } from '$lib/server/lucide-icons';

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.auth) return json({ error: 'Unauthorized' }, { status: 401 });
	const email = userEmailFromAuth(locals.auth);

	const body = (await request.json().catch(() => null)) as
		| { displayName?: string; color?: string; icon?: string | null }
		| null;
	if (!body) return json({ error: 'Invalid body' }, { status: 400 });
	const icon = parseIconPatch(body.icon);
	if (icon === 'invalid') return json({ error: 'Unknown icon' }, { status: 400 });

	upsertLabelMeta(email, params.id, {
		displayName: body.displayName,
		color: body.color,
		icon
	});

	const meta = getLabelMeta(email, params.id);
	return json(meta && { ...meta, icon: meta.icon || null, iconNode: lucideNode(meta.icon) });
};

export const DELETE: RequestHandler = ({ locals, params }) => {
	if (!locals.auth) return json({ error: 'Unauthorized' }, { status: 401 });
	const email = userEmailFromAuth(locals.auth);
	deleteLabelMeta(email, params.id);
	return json({ success: true });
};

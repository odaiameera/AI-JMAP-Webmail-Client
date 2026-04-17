import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { userEmailFromAuth } from '$lib/server/user';
import { deleteSignature, updateSignature } from '$lib/server/db/queries/signatures';

function parseId(raw: string): number | null {
	const id = Number.parseInt(raw, 10);
	return Number.isFinite(id) && id > 0 ? id : null;
}

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.auth) return json({ error: 'Unauthorized' }, { status: 401 });
	const id = parseId(params.id);
	if (id === null) return json({ error: 'Bad id' }, { status: 400 });
	const email = userEmailFromAuth(locals.auth);

	const body = (await request.json().catch(() => null)) as
		| { name?: string; html?: string; isDefault?: boolean }
		| null;
	if (!body) return json({ error: 'Invalid body' }, { status: 400 });

	const updated = updateSignature(email, id, body);
	if (!updated) return json({ error: 'Not found' }, { status: 404 });
	return json(updated);
};

export const DELETE: RequestHandler = ({ locals, params }) => {
	if (!locals.auth) return json({ error: 'Unauthorized' }, { status: 401 });
	const id = parseId(params.id);
	if (id === null) return json({ error: 'Bad id' }, { status: 400 });
	const email = userEmailFromAuth(locals.auth);
	deleteSignature(email, id);
	return json({ success: true });
};

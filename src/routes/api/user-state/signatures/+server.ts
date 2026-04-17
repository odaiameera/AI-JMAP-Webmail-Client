import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { userEmailFromAuth } from '$lib/server/user';
import { createSignature, listSignatures } from '$lib/server/db/queries/signatures';

export const GET: RequestHandler = ({ locals }) => {
	if (!locals.auth) return json({ error: 'Unauthorized' }, { status: 401 });
	const email = userEmailFromAuth(locals.auth);
	return json(listSignatures(email));
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.auth) return json({ error: 'Unauthorized' }, { status: 401 });
	const email = userEmailFromAuth(locals.auth);

	const body = (await request.json().catch(() => null)) as
		| { name?: string; html?: string; isDefault?: boolean }
		| null;
	if (!body || typeof body.name !== 'string' || typeof body.html !== 'string') {
		return json({ error: 'name and html required' }, { status: 400 });
	}

	const created = createSignature(email, body.name, body.html, body.isDefault === true);
	return json(created, { status: 201 });
};

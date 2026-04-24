import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { userEmailFromAuth } from '$lib/server/user';
import { createSignature, listSignatures } from '$lib/server/db/queries/signatures';
import { sanitizeSignatureHtml } from '$lib/utils/sanitize-signature';

const MAX_NAME = 80;
const MAX_HTML = 10_000;

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
	if (body.html.length > MAX_HTML) {
		return json({ error: 'Signature HTML exceeds size limit' }, { status: 413 });
	}

	const name = body.name.trim().slice(0, MAX_NAME);
	if (name.length === 0) return json({ error: 'name required' }, { status: 400 });

	const cleanHtml = sanitizeSignatureHtml(body.html);
	const created = createSignature(email, name, cleanHtml, body.isDefault === true);
	return json(created, { status: 201 });
};

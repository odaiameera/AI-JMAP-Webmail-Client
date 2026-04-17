import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { userEmailFromAuth } from '$lib/server/user';
import { clearAvatar, getAvatar, setAvatar } from '$lib/server/db/queries/user-settings';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2MB cap matches the client compressor

export const GET: RequestHandler = ({ locals }) => {
	if (!locals.auth) return json({ error: 'Unauthorized' }, { status: 401 });
	const email = userEmailFromAuth(locals.auth);
	const avatar = getAvatar(email);
	return json(avatar);
};

export const PUT: RequestHandler = async ({ locals, request }) => {
	if (!locals.auth) return json({ error: 'Unauthorized' }, { status: 401 });
	const email = userEmailFromAuth(locals.auth);

	const body = (await request.json().catch(() => null)) as
		| { data?: string; offset?: { x?: number; y?: number; zoom?: number } }
		| null;

	if (!body || typeof body.data !== 'string' || !body.data.startsWith('data:image/')) {
		return json({ error: 'Avatar data must be a data: image URL' }, { status: 400 });
	}
	if (body.data.length > MAX_AVATAR_BYTES) {
		return json({ error: 'Avatar exceeds 2MB' }, { status: 413 });
	}

	const offset = {
		x: typeof body.offset?.x === 'number' ? body.offset.x : 0,
		y: typeof body.offset?.y === 'number' ? body.offset.y : 0,
		zoom: typeof body.offset?.zoom === 'number' ? body.offset.zoom : 1
	};

	setAvatar(email, body.data, offset);
	return json({ data: body.data, offset });
};

export const DELETE: RequestHandler = ({ locals }) => {
	if (!locals.auth) return json({ error: 'Unauthorized' }, { status: 401 });
	const email = userEmailFromAuth(locals.auth);
	clearAvatar(email);
	return json({ success: true });
};

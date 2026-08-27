import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clearAvatar, getAvatar, setAvatar } from '$lib/server/db/queries/app-prefs';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2MB cap matches the client compressor

/**
 * The person's own avatar. Keyed to the webmail login, not to a mail account —
 * it used to hang off `user_settings`, which is keyed by the active account's
 * email, so with two accounts linked you had two avatars and switching account
 * switched your face. Migration 009 carries the existing image across.
 */
export const GET: RequestHandler = ({ locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	return json(getAvatar(locals.user.id));
};

export const PUT: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

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

	setAvatar(locals.user.id, body.data, offset);
	return json({ data: body.data, offset });
};

export const DELETE: RequestHandler = ({ locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	clearAvatar(locals.user.id);
	return json({ success: true });
};

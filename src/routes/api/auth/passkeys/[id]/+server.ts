import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deletePasskey, renamePasskey } from '$lib/server/auth/passkeys';

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) error(401, 'Not signed in');
	const { name } = (await request.json()) as { name?: string };
	if (!name?.trim()) error(400, 'Name is required');
	renamePasskey(locals.user.id, params.id, name.trim());
	return json({ success: true });
};

// Deleting the last passkey is fine — the master password still works.
export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) error(401, 'Not signed in');
	deletePasskey(locals.user.id, params.id);
	return json({ success: true });
};

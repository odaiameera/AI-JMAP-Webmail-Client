import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** Make a linked account the active one. Client follows up with invalidateAll(). */
export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	if (!locals.user) error(401, 'Not signed in');

	const { id } = (await request.json()) as { id?: string };
	if (!id || !locals.accounts?.some((a) => a.id === id)) {
		error(400, 'Unknown account');
	}

	cookies.set('active_account', id, {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'strict',
		maxAge: 365 * 24 * 60 * 60
	});
	return json({ success: true });
};

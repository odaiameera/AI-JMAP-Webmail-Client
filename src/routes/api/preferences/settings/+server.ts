import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const { displayName, signature } = await request.json();

	if (displayName !== undefined) {
		cookies.set('display_name', displayName, {
			path: '/',
			maxAge: 60 * 60 * 24 * 365,
			httpOnly: false,
			sameSite: 'strict',
			secure: true
		});
	}
	if (signature !== undefined) {
		cookies.set('signature', encodeURIComponent(signature), {
			path: '/',
			maxAge: 60 * 60 * 24 * 365,
			httpOnly: false,
			sameSite: 'strict',
			secure: true
		});
	}

	return json({ success: true });
};

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const COOKIE_NAME = 'folder_expanded';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const { value } = (await request.json()) as { value: Record<string, boolean> };

	if (!value || typeof value !== 'object') {
		return json({ error: 'value must be an object' }, { status: 400 });
	}

	cookies.set(COOKIE_NAME, encodeURIComponent(JSON.stringify(value)), {
		path: '/',
		maxAge: 60 * 60 * 24 * 365,
		httpOnly: false,
		sameSite: 'strict',
		secure: true
	});

	return json({ success: true });
};

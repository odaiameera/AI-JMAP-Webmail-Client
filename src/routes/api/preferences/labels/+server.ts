import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies }) => {
	const raw = cookies.get('mail_labels');
	const labels = raw ? JSON.parse(decodeURIComponent(raw)) : [];
	return json({ labels });
};

export const POST: RequestHandler = async ({ request, cookies }) => {
	const { labels } = await request.json();
	cookies.set('mail_labels', encodeURIComponent(JSON.stringify(labels)), {
		path: '/',
		maxAge: 60 * 60 * 24 * 365,
		httpOnly: false,
		sameSite: 'strict',
		secure: true
	});
	return json({ success: true });
};

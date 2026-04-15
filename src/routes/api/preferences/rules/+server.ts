import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies }) => {
	const raw = cookies.get('mail_rules');
	const rules = raw ? JSON.parse(decodeURIComponent(raw)) : [];
	return json({ rules });
};

export const POST: RequestHandler = async ({ request, cookies }) => {
	const { rules } = await request.json();
	cookies.set('mail_rules', encodeURIComponent(JSON.stringify(rules)), {
		path: '/',
		maxAge: 60 * 60 * 24 * 365,
		httpOnly: false,
		sameSite: 'strict',
		secure: true
	});
	return json({ success: true });
};

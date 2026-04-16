import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setPref } from '$lib/server/prefs';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const { seconds } = (await request.json()) as { seconds: number };
	const n = Math.max(0, Math.min(30, Math.floor(seconds ?? 0)));
	setPref(cookies, 'undo_send', String(n));
	return json({ success: true, seconds: n });
};

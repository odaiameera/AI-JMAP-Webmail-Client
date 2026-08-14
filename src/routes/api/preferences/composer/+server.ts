import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setPref } from '$lib/server/prefs';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const body = (await request.json()) as {
		font?: string;
		fontSize?: string;
		autoSaveInterval?: number;
	};

	if (body.font !== undefined) setPref(cookies, 'composer_font', body.font);
	if (body.fontSize !== undefined) setPref(cookies, 'composer_font_size', String(body.fontSize));
	if (body.autoSaveInterval !== undefined) {
		const n = Math.max(5, Math.min(120, Math.floor(body.autoSaveInterval)));
		setPref(cookies, 'autosave_interval', String(n));
	}
	return json({ success: true });
};

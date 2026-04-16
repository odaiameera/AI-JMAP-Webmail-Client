import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setPref, setPrefJson } from '$lib/server/prefs';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const body = (await request.json()) as {
		enabled?: boolean;
		folders?: string[];
	};
	if (body.enabled !== undefined) {
		setPref(cookies, 'notifications', body.enabled ? 'on' : 'off');
	}
	if (body.folders !== undefined) {
		if (!Array.isArray(body.folders)) {
			return json({ error: 'folders must be an array of ids' }, { status: 400 });
		}
		setPrefJson(cookies, 'notification_folders', body.folders);
	}
	return json({ success: true });
};

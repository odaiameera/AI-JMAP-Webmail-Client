import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setPref, setPrefEncoded } from '$lib/server/prefs';

/**
 * Persist the auto-reply (vacation) settings. Callers should follow up
 * with a POST to /api/rules/deploy to push the updated Sieve script —
 * the deploy endpoint reads these cookies and emits a `vacation` block
 * when `enabled === 'on'`.
 */
export const POST: RequestHandler = async ({ request, cookies }) => {
	const body = (await request.json()) as {
		enabled?: boolean;
		subject?: string;
		body?: string;
	};
	if (body.enabled !== undefined) {
		setPref(cookies, 'auto_reply_enabled', body.enabled ? 'on' : 'off');
	}
	if (body.subject !== undefined) {
		setPrefEncoded(cookies, 'auto_reply_subject', body.subject);
	}
	if (body.body !== undefined) {
		setPrefEncoded(cookies, 'auto_reply_body', body.body);
	}
	return json({ success: true });
};

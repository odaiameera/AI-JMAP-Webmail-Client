import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setPref } from '$lib/server/prefs';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const body = (await request.json()) as {
		conversationView?: boolean;
		markReadDelay?: number;
		autoLoadImages?: string;
		defaultSort?: string;
		keyboardShortcuts?: boolean;
	};

	if (body.conversationView !== undefined) {
		setPref(cookies, 'conversation_view', body.conversationView ? 'on' : 'off');
	}
	if (body.markReadDelay !== undefined) {
		const n = Math.max(0, Math.min(10_000, Math.floor(body.markReadDelay)));
		setPref(cookies, 'mark_read_delay', String(n));
	}
	if (body.autoLoadImages !== undefined) {
		if (!['never', 'contacts_only', 'always'].includes(body.autoLoadImages)) {
			return json({ error: 'invalid autoLoadImages' }, { status: 400 });
		}
		setPref(cookies, 'auto_load_images', body.autoLoadImages);
	}
	if (body.defaultSort !== undefined) {
		if (!['date_desc', 'date_asc', 'subject', 'from'].includes(body.defaultSort)) {
			return json({ error: 'invalid defaultSort' }, { status: 400 });
		}
		setPref(cookies, 'default_sort', body.defaultSort);
	}
	if (body.keyboardShortcuts !== undefined) {
		setPref(cookies, 'keyboard_shortcuts', body.keyboardShortcuts ? 'on' : 'off');
	}
	return json({ success: true });
};

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { writePreferences } from '$lib/server/preferences';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Not signed in');
	const body = (await request.json()) as {
		conversationView?: boolean;
		markReadDelay?: number;
		autoLoadImages?: string;
		defaultSort?: string;
		keyboardShortcuts?: boolean;
	};

	const patch: Record<string, string> = {};
	if (body.conversationView !== undefined) {
		patch.conversation_view = body.conversationView ? 'on' : 'off';
	}
	if (body.markReadDelay !== undefined) {
		patch.mark_read_delay = String(Math.max(0, Math.min(10_000, Math.floor(body.markReadDelay))));
	}
	if (body.autoLoadImages !== undefined) {
		if (!['never', 'contacts_only', 'always'].includes(body.autoLoadImages)) {
			return json({ error: 'invalid autoLoadImages' }, { status: 400 });
		}
		patch.auto_load_images = body.autoLoadImages;
	}
	if (body.defaultSort !== undefined) {
		if (!['date_desc', 'date_asc', 'subject', 'from'].includes(body.defaultSort)) {
			return json({ error: 'invalid defaultSort' }, { status: 400 });
		}
		patch.default_sort = body.defaultSort;
	}
	if (body.keyboardShortcuts !== undefined) {
		patch.keyboard_shortcuts = body.keyboardShortcuts ? 'on' : 'off';
	}
	writePreferences(locals.user.id, patch);
	return json({ success: true });
};

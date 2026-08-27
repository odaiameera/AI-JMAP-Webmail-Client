import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { writePreferences } from '$lib/server/preferences';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Not signed in');
	const body = (await request.json()) as {
		font?: string;
		fontSize?: string;
		autoSaveInterval?: number;
	};

	const patch: Record<string, string> = {};
	if (body.font !== undefined) patch.composer_font = body.font;
	if (body.fontSize !== undefined) patch.composer_font_size = String(body.fontSize);
	if (body.autoSaveInterval !== undefined) {
		patch.autosave_interval = String(
			Math.max(5, Math.min(120, Math.floor(body.autoSaveInterval)))
		);
	}
	writePreferences(locals.user.id, patch);
	return json({ success: true });
};

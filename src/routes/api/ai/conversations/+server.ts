import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { userEmailFromAuth } from '$lib/server/user';
import {
	AI_HISTORY_RETENTION_DAYS,
	createConversation,
	listConversations
} from '$lib/server/db/queries/ai-conversations';

/** Past chat sessions, newest first. */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.auth) return json({ error: 'Unauthorized' }, { status: 401 });

	return json({
		conversations: listConversations(userEmailFromAuth(locals.auth)),
		retentionDays: AI_HISTORY_RETENTION_DAYS
	});
};

/**
 * Start a session. It stays out of the history list until the first message
 * is sent, so opening the panel and closing it again leaves nothing behind.
 */
export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.auth) return json({ error: 'Unauthorized' }, { status: 401 });

	return json({ id: createConversation(userEmailFromAuth(locals.auth)) }, { status: 201 });
};

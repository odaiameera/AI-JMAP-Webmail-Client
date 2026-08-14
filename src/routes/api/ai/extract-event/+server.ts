import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	AIExtractionError,
	aiConfigured,
	extractEventFromEmail,
	htmlToPromptText
} from '$lib/server/ai/extract-event';
import { isValidTimeZone } from '$lib/server/calendar/tz';

/**
 * Extract a calendar event from unstructured email prose via the configured
 * Ollama model. The client sends the email's HTML; the server strips it to
 * text before prompting so markup never inflates the context.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.auth) return json({ error: 'Unauthorized' }, { status: 401 });
	if (!aiConfigured()) {
		return json({ error: 'AI extraction is not configured on this server' }, { status: 501 });
	}

	const body = (await request.json().catch(() => null)) as {
		subject?: string;
		html?: string;
		from?: string;
		receivedAt?: string;
		timeZone?: string;
	} | null;
	if (!body || typeof body.html !== 'string') {
		return json({ error: 'html is required' }, { status: 400 });
	}

	const timeZone =
		body.timeZone && isValidTimeZone(body.timeZone) ? body.timeZone : 'UTC';

	try {
		const result = await extractEventFromEmail({
			subject: typeof body.subject === 'string' ? body.subject.slice(0, 500) : '',
			bodyText: htmlToPromptText(body.html),
			from: typeof body.from === 'string' ? body.from.slice(0, 200) : '',
			receivedAt: typeof body.receivedAt === 'string' ? body.receivedAt : new Date().toISOString(),
			timeZone
		});
		return json(result);
	} catch (err) {
		if (err instanceof AIExtractionError) {
			return json({ error: err.message }, { status: err.status });
		}
		return json({ error: 'Extraction failed' }, { status: 502 });
	}
};

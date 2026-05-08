import { json } from '@sveltejs/kit';
import sanitizeHtml from 'sanitize-html';
import type { RequestHandler } from './$types';
import { createIssue, PlaneError } from '$lib/server/plane';

const ALLOWED_PRIORITIES = ['urgent', 'high', 'medium', 'low', 'none'] as const;
type Priority = (typeof ALLOWED_PRIORITIES)[number];

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.auth) return json({ error: 'Unauthorized' }, { status: 401 });

	const body = (await request.json().catch(() => null)) as {
		projectId?: string;
		title?: string;
		descriptionHtml?: string;
		priority?: string;
	} | null;

	if (!body?.projectId || !body.title?.trim()) {
		return json({ error: 'projectId and title are required' }, { status: 400 });
	}

	const priority: Priority | undefined =
		body.priority && (ALLOWED_PRIORITIES as readonly string[]).includes(body.priority)
			? (body.priority as Priority)
			: undefined;

	// Sanitize the description HTML before forwarding — clients can pass
	// quoted email bodies which may contain hostile markup. We intentionally
	// strip scripts, styles, event handlers, and dangerous URL schemes.
	const cleanHtml = body.descriptionHtml
		? sanitizeHtml(body.descriptionHtml, {
				allowedTags: [
					'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre', 'blockquote',
					'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'a', 'hr', 'span', 'div'
				],
				allowedAttributes: { a: ['href', 'title'], span: ['style'], div: ['style'] },
				allowedSchemes: ['http', 'https', 'mailto']
			})
		: undefined;

	const cleanStripped = body.descriptionHtml
		? sanitizeHtml(body.descriptionHtml, { allowedTags: [], allowedAttributes: {} })
				.replace(/\s+/g, ' ')
				.trim()
		: undefined;

	try {
		const issue = await createIssue({
			projectId: body.projectId,
			name: body.title.trim().slice(0, 255),
			description_html: cleanHtml,
			description_stripped: cleanStripped,
			priority
		});
		return json({ issue });
	} catch (err) {
		const status = err instanceof PlaneError ? err.status : 500;
		return json(
			{ error: err instanceof Error ? err.message : 'Failed to create Plane work item' },
			{ status }
		);
	}
};

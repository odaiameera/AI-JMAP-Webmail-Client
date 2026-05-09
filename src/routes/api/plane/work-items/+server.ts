import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createIssue, PlaneError } from '$lib/server/plane';
import { markdownToSafeHtml, markdownToText } from '$lib/server/markdown';

const ALLOWED_PRIORITIES = ['urgent', 'high', 'medium', 'low', 'none'] as const;
type Priority = (typeof ALLOWED_PRIORITIES)[number];

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.auth) return json({ error: 'Unauthorized' }, { status: 401 });

	const body = (await request.json().catch(() => null)) as {
		projectId?: string;
		title?: string;
		descriptionMd?: string;
		priority?: string;
	} | null;

	if (!body?.projectId || !body.title?.trim()) {
		return json({ error: 'projectId and title are required' }, { status: 400 });
	}

	const priority: Priority | undefined =
		body.priority && (ALLOWED_PRIORITIES as readonly string[]).includes(body.priority)
			? (body.priority as Priority)
			: undefined;

	const md = body.descriptionMd?.trim();
	const cleanHtml = md ? markdownToSafeHtml(md) : undefined;
	const cleanStripped = md ? markdownToText(md) : undefined;

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

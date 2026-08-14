import type { RequestHandler } from './$types';
import { enqueuePrefetch } from '$lib/server/avatars';

/**
 * POST /api/avatar/prefetch  { emails: string[] }
 *
 * The mail list posts its visible sender addresses here so the background
 * worker can warm the server-side cache before the user scrolls. Fire-and-
 * forget: returns immediately with how many were queued.
 */
const MAX_BATCH = 200;

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return new Response(null, { status: 401 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return new Response(null, { status: 400 });
	}

	const raw = (body as { emails?: unknown })?.emails;
	if (!Array.isArray(raw)) return new Response(null, { status: 400 });

	const emails = raw.filter((e): e is string => typeof e === 'string').slice(0, MAX_BATCH);
	enqueuePrefetch(emails);

	return new Response(JSON.stringify({ queued: emails.length }), {
		status: 202,
		headers: { 'Content-Type': 'application/json' }
	});
};

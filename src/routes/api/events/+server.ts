import type { RequestHandler } from './$types';

/**
 * SSE proxy for Stalwart's JMAP push channel. The browser's `EventSource`
 * can't carry custom headers, so we open the upstream connection here with
 * the stored Basic auth and stream `text/event-stream` straight through.
 *
 * The eventsource endpoint lives next to the regular JMAP API base —
 * `${apiUrl}eventsource/?types=…&closeafter=no&ping=30` — and Stalwart
 * pushes a JSON `StateChange` payload each time a watched data type
 * changes plus a keep-alive every `ping` seconds.
 */
export const GET: RequestHandler = async ({ locals, request }) => {
	if (!locals.auth) {
		return new Response('Unauthorized', { status: 401 });
	}

	const upstreamUrl =
		`${locals.auth.apiUrl}eventsource/?types=Email,Mailbox,EmailDelivery&closeafter=no&ping=30`;

	let upstream: Response;
	try {
		upstream = await fetch(upstreamUrl, {
			headers: {
				Authorization: locals.auth.authHeader,
				Accept: 'text/event-stream'
			},
			// Cascade browser disconnect to upstream so we don't leak
			// long-lived connections to Stalwart.
			signal: request.signal
		});
	} catch (err) {
		if (err instanceof Error && err.name === 'AbortError') {
			return new Response(null, { status: 499 });
		}
		return new Response('Upstream unreachable', { status: 502 });
	}

	if (!upstream.ok || !upstream.body) {
		return new Response(`Upstream ${upstream.status}`, { status: 502 });
	}

	return new Response(upstream.body, {
		status: 200,
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
			// Disable nginx response buffering when behind a reverse proxy —
			// otherwise events get batched and "real-time" stops being real.
			'X-Accel-Buffering': 'no'
		}
	});
};

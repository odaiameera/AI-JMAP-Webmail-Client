import type { RequestHandler } from './$types';

/**
 * SSE proxy for Stalwart's JMAP push channel. The browser's `EventSource`
 * can't carry custom headers, so we open the upstream connection here with
 * the stored Basic auth and stream `text/event-stream` straight through.
 *
 * The eventsource endpoint lives next to the regular JMAP API base —
 * `${apiUrl}eventsource/?types=…&closeafter=no&ping=10` — and Stalwart
 * emits a named `state` event (RFC 8620 §7.3) with a JSON `StateChange`
 * payload each time a watched data type changes, plus SSE comment
 * keep-alives every `ping` seconds.
 */
export const GET: RequestHandler = async ({ locals, request }) => {
	if (!locals.auth) {
		return new Response('Unauthorized', { status: 401 });
	}

	const upstreamUrl =
		`${locals.auth.apiUrl}eventsource/?types=Email,Mailbox,EmailDelivery&closeafter=no&ping=10`;

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

	const openedAt = Date.now();
	console.log(`[events] upstream open at ${new Date(openedAt).toISOString()}`);

	const monitored = upstream.body.pipeThrough(
		new TransformStream({
			start(controller) {
				// adapter-node only flushes the response headers on the first
				// `res.write()`. Without a primer byte, headers sit queued
				// until Stalwart sends its first chunk (~30s in practice),
				// so the browser's `onopen` doesn't fire and the UI looks
				// disconnected. An SSE comment is a no-op for the client.
				controller.enqueue(new TextEncoder().encode(': ready\n\n'));
			},
			transform(chunk, controller) {
				controller.enqueue(chunk);
			},
			flush() {
				const elapsed = ((Date.now() - openedAt) / 1000).toFixed(1);
				console.log(`[events] upstream ended after ${elapsed}s`);
			}
		})
	);

	return new Response(monitored, {
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

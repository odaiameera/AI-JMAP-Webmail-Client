import type { RequestHandler } from './$types';
import { safeFetch } from '$lib/server/avatars/net';
import { sniffImage } from '$lib/server/avatars/image';

/**
 * GET /api/image-proxy?url=<remote image>
 *
 * Fetches a remote image referenced by an email body and serves it from this
 * origin (the reading view rewrites every remote <img> to point here — see
 * `$lib/utils/email-images`). Loaded directly, a sender's images can be
 * refused by the browser — LinkedIn's CDN answers cross-site loads with
 * `Cross-Origin-Resource-Policy`, other hosts check the Referer, content
 * blockers drop tracker and social domains, and http images are mixed
 * content. Fetched from here, none of that applies, and the sender's
 * tracking pixel sees this server rather than the reader's IP and browser.
 *
 * The target is attacker-controlled (anyone can email you), so:
 *  - only a signed-in session may use it,
 *  - `safeFetch` refuses private/loopback addresses on every redirect hop,
 *  - the body is capped and must sniff as an image — the upstream
 *    Content-Type is never trusted or echoed,
 *  - the response is locked down like the avatar endpoint, because a
 *    same-origin SVG opened directly would otherwise run its scripts.
 */

const MAX_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const ACCEPT = 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8';

/** AVIF isn't in the avatar sniffer (favicons never use it); mail does. */
function sniffAvif(bytes: Buffer): string | null {
	if (bytes.length < 12 || bytes.toString('ascii', 4, 8) !== 'ftyp') return null;
	const brand = bytes.toString('ascii', 8, 12);
	return brand === 'avif' || brand === 'avis' ? 'image/avif' : null;
}

function failure(status: number): Response {
	// Not cached: a CDN hiccup should not leave a hole in the email for a day.
	return new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });
}

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) return failure(401);

	const target = url.searchParams.get('url');
	if (!target || target.length > 4096) return failure(400);
	let parsed: URL;
	try {
		parsed = new URL(target);
	} catch {
		return failure(400);
	}
	if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return failure(400);

	const fetched = await safeFetch(parsed.toString(), {
		accept: ACCEPT,
		maxBytes: MAX_BYTES,
		timeoutMs: TIMEOUT_MS,
		allowHttp: true
	});
	if (!fetched || fetched.status < 200 || fetched.status >= 300) return failure(502);

	const type = sniffImage(fetched.bytes) ?? sniffAvif(fetched.bytes);
	if (!type) return failure(415);

	return new Response(new Uint8Array(fetched.bytes), {
		status: 200,
		headers: {
			'Content-Type': type,
			'Cache-Control': 'private, max-age=86400',
			'X-Content-Type-Options': 'nosniff',
			'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
			'Content-Disposition': 'inline; filename="image"',
			'Referrer-Policy': 'no-referrer'
		}
	});
};

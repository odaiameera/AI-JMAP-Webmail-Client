import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Outbound fetch helper hardened for fetching avatars from arbitrary
 * sender-controlled domains. The sender's domain is untrusted input, so a
 * naive `fetch('https://' + domain + '/favicon.ico')` is an SSRF vector: a
 * crafted sender domain could resolve to a host on the homelab's private
 * network. Every request here:
 *   - is https-only,
 *   - has its hostname resolved and every resulting IP checked against
 *     private/loopback/link-local/reserved ranges before connecting,
 *   - re-checks the final URL host after redirects,
 *   - is bounded by a timeout and a hard byte cap.
 *
 * Caveat: this does not pin the socket to the vetted IP, so a determined DNS
 * rebind between our lookup and fetch's own lookup is theoretically possible.
 * For a single-tenant homelab that residual risk is acceptable; the common
 * "point a domain at 127.0.0.1 / 10.x" attack is blocked.
 */

const DEFAULT_TIMEOUT_MS = 3500;
const DEFAULT_MAX_BYTES = 256 * 1024;

// Present as a real browser. Many sites (OpenAI, anything behind a basic bot
// wall) return 403 to an unrecognized User-Agent, which would otherwise hide
// their favicon. This is a read-only GET of a public icon, so a browser UA is
// appropriate and standard for favicon fetchers.
const BROWSER_UA =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function ipIsPrivate(ip: string): boolean {
	const v = isIP(ip);
	if (v === 4) {
		const p = ip.split('.').map(Number);
		if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
		const [a, b] = p;
		if (a === 0 || a === 10 || a === 127) return true;
		if (a === 169 && b === 254) return true; // link-local
		if (a === 172 && b >= 16 && b <= 31) return true;
		if (a === 192 && b === 168) return true;
		if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
		if (a >= 224) return true; // multicast / reserved
		return false;
	}
	if (v === 6) {
		const lc = ip.toLowerCase().replace(/^\[|\]$/g, '');
		if (lc === '::1' || lc === '::') return true;
		if (lc.startsWith('fe80')) return true; // link-local
		if (lc.startsWith('fec0')) return true; // deprecated site-local
		if (lc.startsWith('fc') || lc.startsWith('fd')) return true; // unique-local
		if (lc.startsWith('64:ff9b:')) return true; // NAT64 (may embed a private v4)
		if (lc.startsWith('2001:db8')) return true; // documentation
		if (lc.startsWith('2002:')) return true; // 6to4 (may embed a private v4)
		if (lc.startsWith('::ffff:')) return ipIsPrivate(lc.slice('::ffff:'.length)); // v4-mapped
		if (lc.startsWith('::') && lc.includes('.')) return true; // IPv4-compatible ::a.b.c.d
		return false;
	}
	return true; // not a parseable IP → treat as unsafe
}

async function assertPublicHost(hostname: string): Promise<void> {
	const h = hostname.toLowerCase().replace(/\.$/, '');
	if (
		!h ||
		h === 'localhost' ||
		h.endsWith('.localhost') ||
		h.endsWith('.local') ||
		h.endsWith('.internal') ||
		h.endsWith('.lan') ||
		h.endsWith('.home')
	) {
		throw new Error('blocked host');
	}
	if (isIP(h)) {
		if (ipIsPrivate(h)) throw new Error('blocked ip literal');
		return;
	}
	const results = await lookup(h, { all: true });
	if (!results.length) throw new Error('no dns');
	for (const r of results) {
		if (ipIsPrivate(r.address)) throw new Error('resolves to private ip');
	}
}

export type FetchedBlob = { bytes: Buffer; contentType: string | null; status: number };

const MAX_REDIRECTS = 4;

export async function safeFetch(
	rawUrl: string,
	opts: { accept?: string; maxBytes?: number; timeoutMs?: number } = {}
): Promise<FetchedBlob | null> {
	const max = opts.maxBytes ?? DEFAULT_MAX_BYTES;
	let target = rawUrl;

	// Follow redirects manually so EVERY hop's host is vetted before we connect
	// to it. With `redirect: 'follow'`, undici would resolve and connect to an
	// intermediate Location pointing at a private/link-local address before we
	// ever get to re-check the final URL — a blind-SSRF hole. Manual mode lets
	// us re-run assertPublicHost on each hop's target first.
	for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
		let url: URL;
		try {
			url = new URL(target);
		} catch {
			return null;
		}
		if (url.protocol !== 'https:') return null;
		try {
			await assertPublicHost(url.hostname);
		} catch {
			return null;
		}

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
		let res: Response;
		try {
			res = await fetch(url, {
				signal: controller.signal,
				redirect: 'manual',
				headers: {
					'User-Agent': BROWSER_UA,
					...(opts.accept ? { Accept: opts.accept } : {})
				}
			});
		} catch {
			clearTimeout(timer);
			return null;
		}
		clearTimeout(timer);

		if (res.status >= 300 && res.status < 400) {
			const location = res.headers.get('location');
			if (!location) return null;
			try {
				target = new URL(location, url).toString(); // re-vetted at loop top
			} catch {
				return null;
			}
			continue;
		}

		const declared = Number(res.headers.get('content-length') ?? '');
		if (Number.isFinite(declared) && declared > max) return null;
		const bytes = await readCapped(res, max);
		if (!bytes) return null;
		return { bytes, contentType: res.headers.get('content-type'), status: res.status };
	}

	return null; // too many redirects
}

/** Read a response body, aborting if it exceeds `max` bytes (defends against
 *  an oversized or content-length-lying body). */
async function readCapped(res: Response, max: number): Promise<Buffer | null> {
	if (!res.body) {
		const ab = await res.arrayBuffer().catch(() => null);
		if (!ab || ab.byteLength > max) return null;
		return Buffer.from(ab);
	}
	const reader = res.body.getReader();
	const chunks: Buffer[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		if (value) {
			total += value.byteLength;
			if (total > max) {
				await reader.cancel().catch(() => {});
				return null;
			}
			chunks.push(Buffer.from(value));
		}
	}
	return chunks.length ? Buffer.concat(chunks) : null;
}

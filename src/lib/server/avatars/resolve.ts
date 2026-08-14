import { createHash } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import { safeFetch } from './net';
import { sniffImage } from './image';

/**
 * The individual avatar sources. Each returns the resolved image or null.
 * Everything is fetched server-side, directly from the sender's own domain /
 * DNS (and gravatar.com), never via a third-party logo aggregator — so no
 * outside service learns who emails this mailbox.
 */

export type Resolved = {
	contentType: string;
	bytes: Buffer;
	source: 'bimi' | 'favicon' | 'gravatar';
} | null;

export function emailDomain(email: string): string {
	const at = email.lastIndexOf('@');
	return at >= 0 ? email.slice(at + 1).trim().toLowerCase() : '';
}

// Common multi-label public suffixes, so we strip a subdomain down to the
// right registrable domain (news.example.co.uk → example.co.uk, not co.uk).
// Not the full Public Suffix List — just the suffixes mail commonly comes from.
const MULTI_LABEL_TLDS = new Set([
	'co.uk', 'org.uk', 'me.uk', 'ac.uk', 'gov.uk', 'net.uk', 'sch.uk',
	'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'id.au',
	'co.nz', 'net.nz', 'org.nz', 'govt.nz',
	'co.jp', 'or.jp', 'ne.jp', 'ac.jp', 'go.jp',
	'co.kr', 'or.kr', 'go.kr',
	'com.br', 'net.br', 'org.br', 'gov.br',
	'com.cn', 'net.cn', 'org.cn', 'gov.cn',
	'co.in', 'net.in', 'org.in', 'gov.in',
	'co.za', 'org.za', 'co.il', 'co.id', 'co.th',
	'com.mx', 'com.ar', 'com.tr', 'com.sg', 'com.hk', 'com.tw',
	'com.sa', 'com.eg', 'com.my', 'com.ph', 'com.vn', 'com.ua'
]);

/**
 * Reduce a (possibly sub-)domain to its registrable root, used as a fallback
 * when the exact sender domain has no website/favicon of its own
 * (e.g. email.openai.com → openai.com, mg.news.brand.com → brand.com).
 */
export function registrableDomain(domain: string): string {
	const parts = domain.toLowerCase().split('.').filter(Boolean);
	if (parts.length <= 2) return parts.join('.');
	const lastTwo = parts.slice(-2).join('.');
	if (MULTI_LABEL_TLDS.has(lastTwo) && parts.length >= 3) return parts.slice(-3).join('.');
	return lastTwo;
}

// DNS-over-HTTPS fallback for TXT lookups. Some networks/hosts refuse TXT
// queries to the system resolver (you get EREFUSED/SERVFAIL), which silently
// breaks BIMI — and BIMI is the ONLY way to get a logo for brands that block
// direct favicon fetches (e.g. Financial Times serves a 403 to everything).
// We only escalate to DoH when the local resolver *can't answer at all*; a
// genuine "no record" (ENOTFOUND/ENODATA) needs no fallback, so on a healthy
// network this never fires and no domain is sent to the DoH provider.
// Set to '' to disable the fallback entirely.
const BIMI_DOH_URL = 'https://cloudflare-dns.com/dns-query';

async function dohTxt(name: string): Promise<string[]> {
	if (!BIMI_DOH_URL) return [];
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 3000);
	try {
		const res = await fetch(`${BIMI_DOH_URL}?name=${encodeURIComponent(name)}&type=TXT`, {
			headers: { accept: 'application/dns-json' },
			signal: controller.signal
		});
		if (!res.ok) return [];
		const json = (await res.json()) as { Answer?: Array<{ data?: string }> };
		return (json.Answer ?? [])
			// TXT data arrives quoted, and long records arrive as "chunk1" "chunk2";
			// drop the inter-chunk separators, then the surrounding quotes.
			.map((a) => (a.data ?? '').replace(/"\s+"/g, '').replace(/"/g, ''))
			.filter(Boolean);
	} catch {
		return [];
	} finally {
		clearTimeout(timer);
	}
}

async function lookupTxt(name: string): Promise<string[]> {
	try {
		const records = await resolveTxt(name);
		return records.map((parts) => parts.join(''));
	} catch (err) {
		const code = (err as NodeJS.ErrnoException)?.code;
		// Real "no such record" — don't bother the DoH provider.
		if (code === 'ENOTFOUND' || code === 'ENODATA') return [];
		// Resolver couldn't answer (EREFUSED/SERVFAIL/ETIMEOUT/…) — try DoH.
		return dohTxt(name);
	}
}

/** BIMI: a DNS-published brand logo (SVG). The gold standard for company marks. */
export async function resolveBimi(domain: string): Promise<Resolved> {
	const records = await lookupTxt(`default._bimi.${domain}`);
	const txt = records.find((t) => /v=BIMI1/i.test(t));
	if (!txt) return null;
	const url = txt.match(/(?:^|;)\s*l\s*=\s*([^;]+)/i)?.[1]?.trim();
	if (!url) return null;

	const blob = await safeFetch(url, {
		accept: 'image/svg+xml',
		timeoutMs: 3000,
		maxBytes: 128 * 1024
	});
	if (!blob || blob.status !== 200) return null;
	// BIMI requires SVG Tiny PS — anything else is non-conformant, skip it.
	if (sniffImage(blob.bytes) !== 'image/svg+xml') return null;
	return { contentType: 'image/svg+xml', bytes: blob.bytes, source: 'bimi' };
}

const LINK_TAG_RE = /<link\b[^>]*>/gi;

/** Pick the best icon link from a homepage's <head>, preferring apple-touch
 *  icons and larger declared sizes (they're higher-resolution PNGs). */
function bestIconHref(html: string, baseUrl: string): string | null {
	let best: { href: string; score: number } | null = null;
	for (const tag of html.match(LINK_TAG_RE) ?? []) {
		if (!/\brel\s*=\s*["'][^"']*icon[^"']*["']/i.test(tag)) continue;
		const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
		if (!href) continue;
		let score = 1;
		if (/apple-touch-icon/i.test(tag)) score = 4;
		const size = tag.match(/\bsizes\s*=\s*["'](\d+)x\d+["']/i);
		if (size) score = Math.max(score, Math.min(6, Math.floor(Number(size[1]) / 32) + 1));
		try {
			const abs = new URL(href, baseUrl).toString();
			if (!best || score > best.score) best = { href: abs, score };
		} catch {
			// skip unparseable href
		}
	}
	return best?.href ?? null;
}

/** Favicon: parse the homepage for a declared icon, else try well-known paths. */
export async function resolveFavicon(domain: string): Promise<Resolved> {
	const candidates: string[] = [];

	const home = await safeFetch(`https://${domain}/`, {
		accept: 'text/html',
		timeoutMs: 3000,
		maxBytes: 512 * 1024
	});
	if (home && home.status === 200 && /text\/html/i.test(home.contentType ?? '')) {
		const href = bestIconHref(home.bytes.toString('utf8'), `https://${domain}/`);
		if (href) candidates.push(href);
	}
	// Conventional locations as a fallback. apple-touch-icon first — it's a
	// proper PNG at a useful size on most sites.
	candidates.push(`https://${domain}/apple-touch-icon.png`, `https://${domain}/favicon.ico`);

	for (const url of candidates) {
		const blob = await safeFetch(url, { accept: 'image/*', timeoutMs: 3000, maxBytes: 256 * 1024 });
		if (!blob || blob.status !== 200) continue;
		const mime = sniffImage(blob.bytes);
		if (!mime) continue; // not a real image (e.g. SPA returned index.html)
		return { contentType: mime, bytes: blob.bytes, source: 'favicon' };
	}
	return null;
}

/** Gravatar: a globally-recognised avatar for the exact address. d=404 makes
 *  "no avatar set" a clean 404 we can negative-cache. */
export async function resolveGravatar(email: string): Promise<Resolved> {
	const hash = createHash('md5').update(email.trim().toLowerCase()).digest('hex');
	const blob = await safeFetch(`https://www.gravatar.com/avatar/${hash}?d=404&s=160`, {
		accept: 'image/*',
		timeoutMs: 3000,
		maxBytes: 128 * 1024
	});
	if (!blob || blob.status !== 200) return null;
	const mime = sniffImage(blob.bytes);
	if (!mime) return null;
	return { contentType: mime, bytes: blob.bytes, source: 'gravatar' };
}

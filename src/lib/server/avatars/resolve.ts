import { createHash } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import { safeFetch } from './net';
import { imageSize, sniffImage } from './image';

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

/**
 * Every icon link in a homepage's <head>, best first.
 *
 * This used to return only the single highest-scoring link, which is how
 * low-resolution avatars got in: a site declaring a 16x16 .ico in <head> had
 * that one candidate tried, and if it fetched successfully the 180px
 * apple-touch-icon below was never reached. Returning the ranked list lets the
 * caller keep looking for something bigger.
 *
 * Vector icons score highest — an SVG is sharp at any size, which is the whole
 * problem here — then declared `sizes`, then the apple-touch convention (180px
 * by convention, and usually a clean square mark).
 */
function iconHrefs(html: string, baseUrl: string): string[] {
	const found: Array<{ href: string; score: number }> = [];
	for (const tag of html.match(LINK_TAG_RE) ?? []) {
		if (!/\brel\s*=\s*["'][^"']*icon[^"']*["']/i.test(tag)) continue;
		const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
		if (!href) continue;

		let score = 1;
		if (/apple-touch-icon/i.test(tag)) score = 6;
		const size = tag.match(/\bsizes\s*=\s*["'](\d+)x\d+["']/i);
		if (size) score = Math.max(score, Math.min(9, Math.floor(Number(size[1]) / 32) + 2));
		if (/\.svg\b/i.test(href) || /type\s*=\s*["']image\/svg/i.test(tag)) score = 10;

		try {
			found.push({ href: new URL(href, baseUrl).toString(), score });
		} catch {
			// skip unparseable href
		}
	}
	found.sort((a, b) => b.score - a.score);

	// De-duplicate, keeping the best-scoring occurrence of each URL.
	const seen = new Set<string>();
	return found.filter(({ href }) => !seen.has(href) && seen.add(href)).map((f) => f.href);
}

/**
 * Stop looking once a candidate is this big. Rows draw avatars at 32-40 CSS
 * px, so 128 already covers a retina display with room to spare; anything
 * larger cannot look better and only costs another round-trip.
 */
const IDEAL_SIZE = 128;

/** Bound on how many candidate URLs we will actually fetch per domain. */
const MAX_ICON_FETCHES = 5;

/**
 * Favicon: parse the homepage for declared icons, else try well-known paths,
 * and keep the highest-resolution one rather than the first that parses.
 *
 * Taking the first working candidate is what produced blurry avatars — plenty
 * of sites still declare a 16x16 .ico first. Each candidate's real pixel size
 * is read from its header (see `imageSize`), so the choice is made on what the
 * bytes actually are, not on what the markup claims.
 */
export async function resolveFavicon(domain: string): Promise<Resolved> {
	const candidates: string[] = [];

	const home = await safeFetch(`https://${domain}/`, {
		accept: 'text/html',
		timeoutMs: 3000,
		maxBytes: 512 * 1024
	});
	if (home && home.status === 200 && /text\/html/i.test(home.contentType ?? '')) {
		candidates.push(...iconHrefs(home.bytes.toString('utf8'), `https://${domain}/`));
	}
	// Conventional locations, best first: a vector mark, then the apple-touch
	// convention (180px), then the 16x16-era .ico as a last resort.
	candidates.push(
		`https://${domain}/favicon.svg`,
		`https://${domain}/apple-touch-icon.png`,
		`https://${domain}/apple-touch-icon-precomposed.png`,
		`https://${domain}/favicon.ico`
	);

	const seen = new Set<string>();
	let best: { resolved: NonNullable<Resolved>; size: number } | null = null;
	let fetches = 0;

	for (const url of candidates) {
		if (seen.has(url)) continue;
		seen.add(url);
		if (fetches >= MAX_ICON_FETCHES) break;
		fetches++;

		const blob = await safeFetch(url, { accept: 'image/*', timeoutMs: 3000, maxBytes: 256 * 1024 });
		if (!blob || blob.status !== 200) continue;
		const mime = sniffImage(blob.bytes);
		if (!mime) continue; // not a real image (e.g. SPA returned index.html)

		const size = imageSize(blob.bytes, mime);
		if (!best || size > best.size) {
			best = { resolved: { contentType: mime, bytes: blob.bytes, source: 'favicon' }, size };
		}
		// Good enough that a further round-trip cannot improve it.
		if (size >= IDEAL_SIZE) break;
	}

	// A small mark is still served if it is all the domain offers — a soft
	// logo beats a bare initial — but only after every larger candidate above
	// has had its chance.
	return best?.resolved ?? null;
}

/** Gravatar: a globally-recognised avatar for the exact address. d=404 makes
 *  "no avatar set" a clean 404 we can negative-cache. */
export async function resolveGravatar(email: string): Promise<Resolved> {
	const hash = createHash('md5').update(email.trim().toLowerCase()).digest('hex');
	// s=256: avatars are drawn up to 80 CSS px (profile card, account rows),
	// which is 160 device pixels on a retina display; 160 was exactly at that
	// limit with nothing spare. Still a small JPEG/PNG at this size.
	const blob = await safeFetch(`https://www.gravatar.com/avatar/${hash}?d=404&s=256`, {
		accept: 'image/*',
		timeoutMs: 3000,
		maxBytes: 256 * 1024
	});
	if (!blob || blob.status !== 200) return null;
	const mime = sniffImage(blob.bytes);
	if (!mime) return null;
	return { contentType: mime, bytes: blob.bytes, source: 'gravatar' };
}

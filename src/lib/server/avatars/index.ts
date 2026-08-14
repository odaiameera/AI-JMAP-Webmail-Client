import {
	emailDomain,
	registrableDomain,
	resolveBimi,
	resolveFavicon,
	resolveGravatar,
	type Resolved
} from './resolve';
import { getCache, putCache, type CacheRow } from './store';

/**
 * Avatar resolution orchestrator + background prefetch worker.
 *
 * Resolution order per the product decision: BIMI → favicon → Gravatar →
 * (caller renders initials). BIMI/favicon are domain-level and cached under
 * `domain:<d>`; Gravatar is address-level and cached under `gravatar:<email>`.
 * Each network call is cached at its natural granularity, so bytes are never
 * stored twice and a whole company's senders share one favicon fetch.
 */

const FOUND_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MISSING_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — retry "no avatar" weekly

export type AvatarOut =
	| { status: 'found'; contentType: string; bytes: Buffer; source: string }
	| { status: 'missing' };

export function normalizeEmail(raw: string): string {
	let e = raw.trim();
	const angle = e.match(/<([^>]+)>/); // "Name <addr>" → addr
	if (angle) e = angle[1];
	return e.trim().toLowerCase();
}

function isFresh(row: CacheRow): boolean {
	const ttl = row.status === 'found' ? FOUND_TTL_MS : MISSING_TTL_MS;
	return Date.now() - row.fetched_at < ttl;
}

function rowToOut(row: CacheRow): AvatarOut | null {
	if (row.status === 'found' && row.bytes && row.content_type) {
		return {
			status: 'found',
			contentType: row.content_type,
			bytes: row.bytes,
			source: row.source ?? 'favicon'
		};
	}
	if (row.status === 'missing') return { status: 'missing' };
	return null; // corrupt 'found' row with no bytes — treat as a cache miss
}

function store(key: string, resolved: Resolved): void {
	putCache(
		key,
		resolved
			? {
					status: 'found',
					source: resolved.source,
					content_type: resolved.contentType,
					bytes: resolved.bytes,
					fetched_at: Date.now()
				}
			: { status: 'missing', source: null, content_type: null, bytes: null, fetched_at: Date.now() }
	);
}

/** Resolve (or read cached) the domain-level BIMI/favicon asset. */
async function domainAsset(domain: string): Promise<AvatarOut | null> {
	const key = `domain:${domain}`;
	const cached = getCache(key);
	if (cached && isFresh(cached)) {
		const out = rowToOut(cached);
		if (out) return out.status === 'found' ? out : null; // 'missing' → fall through to gravatar
		// corrupt → re-resolve below
	}
	const resolved = (await resolveBimi(domain)) ?? (await resolveFavicon(domain));
	store(key, resolved);
	return resolved
		? { status: 'found', contentType: resolved.contentType, bytes: resolved.bytes, source: resolved.source }
		: null;
}

/** Resolve (or read cached) the address-level Gravatar. */
async function gravatarAsset(email: string): Promise<AvatarOut> {
	const key = `gravatar:${email}`;
	const cached = getCache(key);
	if (cached && isFresh(cached)) {
		const out = rowToOut(cached);
		if (out) return out;
	}
	const resolved = await resolveGravatar(email);
	store(key, resolved);
	return resolved
		? { status: 'found', contentType: resolved.contentType, bytes: resolved.bytes, source: 'gravatar' }
		: { status: 'missing' };
}

// Coalesce concurrent domain resolutions: a screenful of senders sharing one
// domain (a company, a newsletter ESP) would otherwise each fetch that
// domain's homepage+favicon on a cold cache. getAvatar's per-email dedup
// doesn't cover this since the addresses differ — so dedup at the domain too.
const domainInflight = new Map<string, Promise<AvatarOut | null>>();

function domainAssetCoalesced(domain: string): Promise<AvatarOut | null> {
	const existing = domainInflight.get(domain);
	if (existing) return existing;
	const p = domainAsset(domain)
		.catch((): AvatarOut | null => null)
		.finally(() => domainInflight.delete(domain));
	domainInflight.set(domain, p);
	return p;
}

async function compute(email: string): Promise<AvatarOut> {
	const domain = emailDomain(email);
	if (!domain) return { status: 'missing' };

	// Try the exact sender domain first; if it has no site/favicon of its own
	// (common for mg.*, email.*, news.* sending subdomains), fall back to the
	// registrable root so a brand's main-site icon still shows.
	let fromDomain = await domainAssetCoalesced(domain);
	if (!fromDomain) {
		const root = registrableDomain(domain);
		if (root && root !== domain) fromDomain = await domainAssetCoalesced(root);
	}
	if (fromDomain) return fromDomain;

	return gravatarAsset(email);
}

// Coalesce concurrent resolutions of the same address (a page full of rows +
// the prefetch worker can all ask at once) into a single in-flight promise.
const inflight = new Map<string, Promise<AvatarOut>>();

export function getAvatar(rawEmail: string): Promise<AvatarOut> {
	const email = normalizeEmail(rawEmail);
	if (!email.includes('@')) return Promise.resolve({ status: 'missing' });
	const existing = inflight.get(email);
	if (existing) return existing;
	const p = compute(email)
		.catch((): AvatarOut => ({ status: 'missing' }))
		.finally(() => inflight.delete(email));
	inflight.set(email, p);
	return p;
}

// --- Background prefetch worker --------------------------------------------
// When a mail list renders, the client posts its visible sender addresses
// here; this loop resolves+caches them (bounded concurrency) so they're warm
// before the user scrolls. Server-side, so the cache is shared across browsers.

const queue = new Set<string>();
let active = 0;
const MAX_CONCURRENT = 4;
// Hard cap so a client posting endless distinct addresses can't grow this
// in-memory Set without bound. Warming a screenful needs only a few dozen.
const MAX_QUEUE = 500;

export function enqueuePrefetch(rawEmails: string[]): void {
	for (const raw of rawEmails) {
		if (queue.size >= MAX_QUEUE) break;
		const email = normalizeEmail(raw);
		if (email.includes('@')) queue.add(email);
	}
	pump();
}

function pump(): void {
	while (active < MAX_CONCURRENT && queue.size > 0) {
		const next = queue.values().next().value as string;
		queue.delete(next);
		active++;
		void getAvatar(next).finally(() => {
			active--;
			pump();
		});
	}
}

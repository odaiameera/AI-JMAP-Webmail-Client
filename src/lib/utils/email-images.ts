import type { EmailAttachment } from '$lib/jmap/types';
import { attachmentUrl } from '$lib/attachments/fetch';

/**
 * Point every image in an email body somewhere the browser can actually load
 * it from, for the reading view only (replies and forwards keep the sender's
 * original URLs).
 *
 *  - Remote `http(s)` images go through `/api/image-proxy`. Loading them
 *    straight from the sender's CDN fails for a whole class of senders:
 *    LinkedIn and others serve images with `Cross-Origin-Resource-Policy`
 *    or referrer checks that refuse any page but their own, content blockers
 *    drop anything on a "social" or tracker domain, and plain-http images are
 *    blocked as mixed content. Fetched server-side, the image arrives from
 *    this origin and none of that applies — and the sender's tracker sees
 *    the server, not the reader's IP address and browser.
 *  - `cid:` images (inline parts of a multipart/related message) are
 *    resolved to the part itself; the browser has no idea what `cid:` means.
 *
 * String-based rather than DOM-based because the body is also rendered
 * during SSR, where there is no DOMParser.
 */

export const IMAGE_PROXY_PATH = '/api/image-proxy';

/** What a blocked or unloadable image reference becomes: a URL that fetches nothing. */
export const BLOCKED_URL = 'about:invalid';

export interface EmailImageContext {
	emailId: string;
	/** The email's attachments; inline parts carry the `cid` images refer to. */
	attachments: EmailAttachment[];
	/**
	 * `proxy` (the default) loads remote images through the image proxy;
	 * `block` replaces them with {@link BLOCKED_URL} — the reader's
	 * "don't load remote images" choice. Inline `cid:` and `data:` images
	 * are never remote and always show.
	 */
	remote?: 'proxy' | 'block';
}

interface RewriteCtx {
	cids: Map<string, EmailAttachment>;
	emailId: string;
	base: string | null;
	remote: 'proxy' | 'block';
	/** Remote image references replaced because `remote` is `block`. */
	blocked: number;
}

/**
 * Percent-encode everything but unreserved characters, so the result is safe
 * unquoted in an attribute, inside CSS `url()`, and between srcset commas.
 */
function encodeParam(value: string): string {
	return encodeURIComponent(value).replace(
		/[!'()*]/g,
		(c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
	);
}

export function proxiedImageUrl(url: string): string {
	return `${IMAGE_PROXY_PATH}?url=${encodeParam(url)}`;
}

const ENTITY = /&(#\d+|#x[0-9a-f]+|amp|quot|apos|lt|gt);/gi;
const NAMED: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };

function decodeEntities(value: string): string {
	return value.replace(ENTITY, (whole, body: string) => {
		const lower = body.toLowerCase();
		if (lower in NAMED) return NAMED[lower];
		const code = lower.startsWith('#x') ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
		return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
	});
}

function escapeAttr(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/** The new URL for one image reference, or null to leave it untouched. */
function rewriteUrl(raw: string, ctx: RewriteCtx): string | null {
	const value = raw.trim();
	if (!value) return null;

	if (/^cid:/i.test(value)) {
		let id = value.slice(4).replace(/^<|>$/g, '');
		try {
			// RFC 2392: a cid URL is the Content-ID with URL escaping applied.
			id = decodeURIComponent(id);
		} catch {
			// Malformed escape — match it as written.
		}
		const part = ctx.cids.get(id) ?? ctx.cids.get(id.toLowerCase());
		if (!part) return null;
		return attachmentUrl(ctx.emailId, part.blobId, part.name ?? 'image', 'inline');
	}

	let absolute: string;
	if (/^https?:\/\//i.test(value)) absolute = value;
	else if (value.startsWith('//')) absolute = `https:${value}`;
	else if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null; // data:, blob: or some other scheme
	else if (ctx.base) {
		try {
			absolute = new URL(value, ctx.base).toString();
		} catch {
			return BLOCKED_URL;
		}
	} else {
		// Relative with no <base> to resolve it against. The reading view is
		// on this origin, so this would be a request to the webmail itself —
		// `/api/…` with the reader's cookies, or `/api/image-proxy?url=` to
		// sneak a tracker past the remote-image setting. Nothing legitimate
		// lives there, so it loads nothing.
		return BLOCKED_URL;
	}

	if (ctx.remote === 'block') {
		ctx.blocked++;
		return BLOCKED_URL;
	}
	return proxiedImageUrl(absolute);
}

/**
 * srcset is `url descriptor, url descriptor`, but a URL may itself contain
 * commas, so this follows the spec's tokenizer (a URL runs to whitespace)
 * instead of splitting on ','.
 */
function rewriteSrcset(value: string, ctx: RewriteCtx): string {
	const out: string[] = [];
	let i = 0;
	while (i < value.length) {
		while (i < value.length && /[\s,]/.test(value[i])) i++;
		if (i >= value.length) break;
		let start = i;
		while (i < value.length && !/\s/.test(value[i])) i++;
		let url = value.slice(start, i);
		let descriptor = '';
		if (url.endsWith(',')) {
			url = url.replace(/,+$/, '');
		} else {
			start = i;
			while (i < value.length && value[i] !== ',') i++;
			descriptor = value.slice(start, i).trim();
		}
		const next = rewriteUrl(url, ctx) ?? url;
		out.push(descriptor ? `${next} ${descriptor}` : next);
	}
	return out.join(', ');
}

// @import pulls in a stylesheet and @font-face a font — neither is an image,
// and the proxy only serves images, so both are matched first and left alone.
// The reading view's CSP (emailFrameCsp) is what stops them loading.
const CSS_URL =
	/(@import[^;]*;?|@font-face\s*\{[^}]*\})|url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"'\s]*))\s*\)/gi;

function rewriteCss(css: string, ctx: RewriteCtx): string {
	return css.replace(CSS_URL, (whole, skip, dq, sq, bare) => {
		if (skip) return whole;
		const next = rewriteUrl(decodeCssEscapes(dq ?? sq ?? bare ?? ''), ctx);
		if (next === null) return whole;
		return `url("${next.replace(/["\\\n\r]/g, (c) => encodeURIComponent(c))}")`;
	});
}

function decodeCssEscapes(value: string): string {
	return value.replace(/\\([0-9a-f]{1,6}\s?|.)/gi, (_, esc: string) => {
		const hex = esc.trim();
		if (/^[0-9a-f]+$/i.test(hex) && esc.length > 1) {
			const code = parseInt(hex, 16);
			return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
		}
		return esc;
	});
}

// A start tag, with quoted attribute values allowed to contain '>'.
const TAG = /<([a-z][a-z0-9:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
const ATTR = /(\s)([^\s"'>/=]+)(?:(\s*=\s*)("[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g;

function rewriteTag(tag: string, name: string, attrs: string, ctx: RewriteCtx): string {
	const lowerName = name.toLowerCase();
	let changed = false;
	const nextAttrs = attrs.replace(ATTR, (whole, space: string, attrName: string, _eq, rawValue?: string) => {
		if (rawValue === undefined) return whole;
		const key = attrName.toLowerCase();
		const quoted = rawValue.startsWith('"') || rawValue.startsWith("'");
		const value = decodeEntities(quoted ? rawValue.slice(1, -1) : rawValue);

		let next: string | null = null;
		if (key === 'src' && (lowerName === 'img' || lowerName === 'input')) next = rewriteUrl(value, ctx);
		else if (key === 'srcset' && (lowerName === 'img' || lowerName === 'source')) {
			const rewritten = rewriteSrcset(value, ctx);
			next = rewritten === value ? null : rewritten;
		} else if (key === 'background' || (key === 'poster' && lowerName === 'video')) {
			next = rewriteUrl(value, ctx);
		} else if ((key === 'href' || key === 'xlink:href') && (lowerName === 'image' || lowerName === 'feimage')) {
			// SVG's way of drawing a picture: the same request as an <img>.
			next = rewriteUrl(value, ctx);
		} else if (key === 'style') {
			const rewritten = rewriteCss(value, ctx);
			next = rewritten === value ? null : rewritten;
		}

		if (next === null) return whole;
		changed = true;
		return `${space}${attrName}="${escapeAttr(next)}"`;
	});
	return changed ? `<${name}${nextAttrs}>` : tag;
}

export function rewriteEmailImages(html: string, context: EmailImageContext): string {
	return rewrite(html, context).html;
}

function rewrite(html: string, context: EmailImageContext): { html: string; blocked: number } {
	if (!html) return { html, blocked: 0 };

	const cids = new Map<string, EmailAttachment>();
	for (const part of context.attachments) {
		if (!part.cid) continue;
		if (!cids.has(part.cid)) cids.set(part.cid, part);
		const lower = part.cid.toLowerCase();
		if (!cids.has(lower)) cids.set(lower, part);
	}
	const ctx: RewriteCtx = {
		cids,
		emailId: context.emailId,
		base: null,
		remote: context.remote ?? 'proxy',
		blocked: 0
	};

	// A sender's <base href> would re-root our /api/image-proxy URLs onto the
	// sender's own host. Keep its href to resolve relative image paths the
	// way the sender meant, then drop the element.
	let out = html.replace(/<base\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi, (tag) => {
		if (!ctx.base) {
			const href = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
			const value = href ? decodeEntities(href[1] ?? href[2] ?? href[3] ?? '').trim() : '';
			if (/^https?:\/\//i.test(value)) ctx.base = value;
		}
		return '';
	});

	out = out.replace(
		/(<style\b[^>]*>)([\s\S]*?)(<\/style\s*>)/gi,
		(_, open: string, css: string, close: string) => `${open}${rewriteCss(css, ctx)}${close}`
	);

	out = out.replace(TAG, (tag, name: string, attrs: string) => rewriteTag(tag, name, attrs, ctx));
	return { html: out, blocked: ctx.blocked };
}

// <link> covers stylesheets but also dns-prefetch, preconnect and prefetch,
// which reach the sender's host without any CSP directive applying.
const LINK_TAG = /<link\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
const META_TAG = /<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
// A meta refresh navigates the frame itself — to a tracker, or a phishing page.
const REFRESH = /\shttp-equiv\s*=\s*(?:"\s*refresh\s*"|'\s*refresh\s*'|refresh\b)/i;

/**
 * The body exactly as the reading view shows it: images rewritten per
 * {@link rewriteEmailImages}, plus the elements that load or navigate
 * outside what an image rule can stop removed. `blockedRemote` counts the
 * remote images left out, so the view can offer to load them.
 */
export function prepareEmailForReading(
	html: string,
	context: EmailImageContext
): { html: string; blockedRemote: number } {
	const { html: rewritten, blocked } = rewrite(html, context);
	const out = rewritten
		.replace(LINK_TAG, '')
		.replace(META_TAG, (tag) => (REFRESH.test(tag) ? '' : tag));
	return { html: out, blockedRemote: blocked };
}

/**
 * Content-Security-Policy for the reading view's iframe, delivered as a
 * `<meta>` at the top of its srcdoc.
 *
 * The rewrite above is the first line; this is the one that holds when a
 * construct slips past a string rewrite. The email cannot script (the frame
 * is sandboxed without `allow-scripts`), so the policy is about what it may
 * fetch: images only from this server's attachment routes, from the image
 * proxy when remote images are allowed, and inline `data:`/`blob:`. No
 * stylesheets, fonts, media, frames or form posts reach the sender.
 *
 * `origin` is spelled out rather than `'self'` because a path-restricted
 * source needs a host, and path restriction is what keeps the proxy out of
 * the policy entirely while remote images are blocked.
 */
export function emailFrameCsp(origin: string, allowRemote: boolean): string {
	let parsed: URL;
	try {
		parsed = new URL(origin);
	} catch {
		throw new Error('emailFrameCsp: invalid origin');
	}
	if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || parsed.origin !== origin) {
		throw new Error('emailFrameCsp: invalid origin');
	}
	const img = [`${origin}/api/email/`, ...(allowRemote ? [`${origin}${IMAGE_PROXY_PATH}`] : []), 'data:', 'blob:'];
	return [
		"default-src 'none'",
		`img-src ${img.join(' ')}`,
		"style-src 'unsafe-inline'",
		'font-src data:',
		"media-src 'none'",
		"frame-src 'none'",
		"object-src 'none'",
		"form-action 'none'",
		"base-uri 'none'"
	].join('; ');
}

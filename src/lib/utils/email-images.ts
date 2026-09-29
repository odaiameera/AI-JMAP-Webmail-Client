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

export interface EmailImageContext {
	emailId: string;
	/** The email's attachments; inline parts carry the `cid` images refer to. */
	attachments: EmailAttachment[];
}

interface RewriteCtx {
	cids: Map<string, EmailAttachment>;
	emailId: string;
	base: string | null;
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
	else if (ctx.base && !/^[a-z][a-z0-9+.-]*:/i.test(value)) {
		try {
			absolute = new URL(value, ctx.base).toString();
		} catch {
			return null;
		}
	} else return null; // data:, relative with no base, or some other scheme

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
	if (!html) return html;

	const cids = new Map<string, EmailAttachment>();
	for (const part of context.attachments) {
		if (!part.cid) continue;
		if (!cids.has(part.cid)) cids.set(part.cid, part);
		const lower = part.cid.toLowerCase();
		if (!cids.has(lower)) cids.set(lower, part);
	}
	const ctx: RewriteCtx = { cids, emailId: context.emailId, base: null };

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

	return out.replace(TAG, (tag, name: string, attrs: string) => rewriteTag(tag, name, attrs, ctx));
}

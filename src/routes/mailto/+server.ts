import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Entry point for the `mailto:` protocol handler (see manifest.webmanifest and
 * the registerProtocolHandler call in the (app) layout). When the OS / browser
 * treats this PWA as the default mail app, clicking a `mailto:` link opens
 *   /mailto?to=<url-encoded full mailto: URL>
 *
 * For now we simply land the user on the inbox (per product decision). The full
 * mailto URL is parsed below so upgrading to a prefilled composer later is a
 * small change: drop the parsed fields onto the redirect target / a store and
 * have the composer read them.
 */
export const GET: RequestHandler = ({ url }) => {
	const raw = url.searchParams.get('to') ?? '';
	// Parsed but intentionally unused while we open to the inbox only.
	void parseMailto(raw);
	redirect(303, '/inbox');
};

/** Parse a `mailto:` URL into composer-ready fields. */
function parseMailto(raw: string): {
	to: string[];
	cc: string[];
	bcc: string[];
	subject: string;
	body: string;
} {
	const result = { to: [] as string[], cc: [] as string[], bcc: [] as string[], subject: '', body: '' };
	if (!raw) return result;
	try {
		// Accept either a full `mailto:a@b?...` string or a bare address.
		const withScheme = raw.startsWith('mailto:') ? raw : `mailto:${raw}`;
		const u = new URL(withScheme);
		const splitAddrs = (s: string) =>
			s.split(',').map((a) => decodeURIComponent(a.trim())).filter(Boolean);
		if (u.pathname) result.to = splitAddrs(u.pathname);
		const p = u.searchParams;
		if (p.get('to')) result.to.push(...splitAddrs(p.get('to')!));
		if (p.get('cc')) result.cc = splitAddrs(p.get('cc')!);
		if (p.get('bcc')) result.bcc = splitAddrs(p.get('bcc')!);
		if (p.get('subject')) result.subject = p.get('subject')!;
		if (p.get('body')) result.body = p.get('body')!;
	} catch {
		// Malformed mailto — fall through to an empty result.
	}
	return result;
}

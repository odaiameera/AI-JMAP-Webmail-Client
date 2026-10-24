/**
 * What an email's `List-Unsubscribe` header (RFC 2369) offers, in the order
 * the reading view prefers it:
 *  - `one-click`: RFC 8058 — `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
 *    and an HTTPS URL. The server POSTs to it.
 *  - `mailto`: an address to send an unsubscribe message to.
 *  - `url`: a web page that needs a person to click through; opened in a tab.
 *  - `none`: nothing usable.
 *
 * Shared by the reading view, which decides what the button does, and the
 * unsubscribe endpoint, which acts only on what the stored header says —
 * never on a URL or address the browser sends it.
 */
export type UnsubMode = 'one-click' | 'mailto' | 'url' | 'none';

export interface UnsubInfo {
	mode: UnsubMode;
	url?: string;
	mailto?: string;
}

function entries(header: string): string[] {
	return [...header.matchAll(/<([^>]*)>/g)].map((m) => m[1].trim()).filter(Boolean);
}

export function parseListUnsubscribe(
	header: string | null | undefined,
	postHeader: string | null | undefined
): UnsubInfo {
	if (!header) return { mode: 'none' };
	const uris = entries(header);
	const https = uris.find((u) => /^https:\/\//i.test(u));
	const http = uris.find((u) => /^https?:\/\//i.test(u));
	const mailto = uris.find((u) => /^mailto:/i.test(u));

	if (postHeader?.toLowerCase().includes('one-click') && https) return { mode: 'one-click', url: https };
	if (mailto) return { mode: 'mailto', mailto };
	if (http) return { mode: 'url', url: http };
	return { mode: 'none' };
}

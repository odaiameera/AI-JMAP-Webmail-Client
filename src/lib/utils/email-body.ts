import type { Email } from '$lib/jmap/types';

/**
 * Build the HTML to render for an email from its JMAP body parts.
 *
 * `htmlBody` is "the parts to display when showing the HTML view", and it
 * is not guaranteed to be a single text/html part: for multipart/alternative
 * it is, but for multipart/mixed — a common way scripts and agents build
 * "text + HTML in one message" — JMAP returns BOTH the text/plain and
 * text/html siblings, in MIME order, with the text part first. Blindly
 * rendering `htmlBody[0]` shows the plain-text version (unescaped, at that).
 */

// Senders sometimes ship an HTML body that is really just plaintext wrapped
// in <html><body>…</body></html> with no structural tags. Browsers collapse
// the embedded newlines into one unbroken wall of text. If the body has \n
// characters but none of the tags that would already express structure,
// promote those newlines.
const STRUCTURE_TAGS = /<(p|div|br|h[1-6]|li|tr|blockquote|pre|table|style)\b/i;

function promoteNewlines(html: string): string {
	if (/\n/.test(html) && !STRUCTURE_TAGS.test(html)) {
		return html.replace(/\n/g, '<br>\n');
	}
	return html;
}

function escapeHtml(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function asPre(text: string): string {
	return `<pre style="white-space: pre-wrap; font-family: inherit;">${escapeHtml(text)}</pre>`;
}

/** Returns '' when the email has no renderable body. */
export function renderEmailBodyHtml(email: Email): string {
	const bodyValues = email.bodyValues;
	if (!bodyValues) return '';
	const valueOf = (p: { partId: string }) => bodyValues[p.partId]?.value;

	// Prefer real text/html parts wherever they sit in htmlBody. When a
	// message carries both a text and an html rendition (alternative OR
	// mixed), the html one is the version the sender designed; rendering
	// the text sibling above it would just duplicate the content.
	const htmlParts = (email.htmlBody ?? []).filter(
		(p) => p.type?.toLowerCase().startsWith('text/html') && valueOf(p) !== undefined
	);
	if (htmlParts.length) {
		return htmlParts.map((p) => promoteNewlines(valueOf(p) ?? '')).join('\n');
	}

	// No html rendition — show the text version. textBody can also list
	// several sequential parts; keep them all, in order.
	const textParts = (email.textBody ?? []).filter((p) => valueOf(p) !== undefined);
	if (textParts.length) {
		return asPre(textParts.map((p) => valueOf(p) ?? '').join('\n'));
	}

	// Last resort: any non-html part JMAP queued for the html view (e.g. a
	// text/plain-only message whose textBody was oddly empty).
	const fallback = (email.htmlBody ?? []).filter((p) => valueOf(p) !== undefined);
	if (fallback.length) {
		return asPre(fallback.map((p) => valueOf(p) ?? '').join('\n'));
	}
	return '';
}

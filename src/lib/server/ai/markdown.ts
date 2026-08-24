import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

/**
 * Render an agent reply from markdown to display HTML.
 *
 * This runs on the server, not in the browser, for two reasons: no markdown
 * parser or sanitiser ships to the client, and the sanitising allowlist lives
 * in one place next to the app's other use of `sanitize-html`.
 *
 * Model output is untrusted. It is shaped by email content, and email content
 * is attacker-controlled, so a reply can contain anything an email can talk
 * the model into writing. Everything below therefore assumes the markdown is
 * hostile and allows only what a chat reply legitimately needs.
 */

/**
 * Inline formatting, lists, headings, code, quotes, and tables — the shapes a
 * summary or briefing actually uses.
 *
 * Deliberately absent:
 *  - `img`: a remote URL in an agent reply would beacon back to whoever wrote
 *    the email that produced it. A mail client blocks remote images in mail;
 *    it should not reintroduce them one pane over.
 *  - `script`, `style`, `iframe`, `form`, `input`: no reply needs them, and
 *    each is a way to run code or phish inside the app's own chrome.
 *  - `h1`/`h2`: reserved for the app's own hierarchy. Model headings start at
 *    h3 (remapped below) so a reply cannot outrank the panel's own title.
 */
const ALLOWED_TAGS = [
	'p', 'br', 'strong', 'em', 'del', 'code', 'pre',
	'ul', 'ol', 'li', 'blockquote', 'hr',
	'h3', 'h4', 'h5', 'h6',
	'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td'
];

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
	allowedTags: ALLOWED_TAGS,
	// Links only, and only these three. `target`/`rel` are here because the
	// transform below sets them — allowedAttributes is applied after
	// transformTags, so omitting them would strip the hardening back off.
	// The transform overwrites whatever the model wrote, so listing them
	// does not let a reply choose its own target. No `style` anywhere:
	// inline CSS can position an element over the app's own controls.
	allowedAttributes: { a: ['href', 'target', 'rel'] },
	// No `data:` (script-bearing payloads) and no `javascript:`.
	allowedSchemes: ['http', 'https', 'mailto'],
	// A link whose scheme is not allowed becomes plain text rather than a
	// silently dead link.
	disallowedTagsMode: 'discard',
	transformTags: {
		// Anything the model emits as a link leaves the app, so it opens in a
		// new tab and cannot reach back through `window.opener`.
		a: sanitizeHtml.simpleTransform('a', {
			target: '_blank',
			rel: 'noopener noreferrer nofollow'
		}),
		// Demote so a reply's own headings sit under the panel heading.
		h1: 'h3',
		h2: 'h3'
	}
};

/**
 * Convert an agent reply to sanitised HTML.
 *
 * Returns an empty string for empty input so callers can treat "nothing to
 * render" uniformly rather than checking for whitespace-only markdown.
 */
export function renderAgentMarkdown(markdown: string): string {
	if (!markdown?.trim()) return '';

	const html = marked.parse(markdown, {
		// Sync mode: `marked` returns a promise when async extensions are
		// registered, and there are none here.
		async: false,
		// A single newline inside a paragraph becomes <br>. Models write
		// wrapped prose and list-ish lines; without this they collapse into
		// one run-on paragraph.
		breaks: true,
		gfm: true
	}) as string;

	return sanitizeHtml(html, SANITIZE_OPTIONS).trim();
}

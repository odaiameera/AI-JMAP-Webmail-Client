import DOMPurify from 'dompurify';

/**
 * Clean the HTML mammoth makes from a .docx attachment before the viewer puts
 * it in the page.
 *
 * mammoth converts, it does not sanitise: a hyperlink whose target is
 * `javascript:…` comes out as `<a href="javascript:…">`, and the viewer
 * renders into the app's own DOM, so one click would run the sender's script
 * as you. Anyone can email you a .docx, so the output is treated as hostile:
 *
 *  - DOMPurify's HTML profile drops scripts, event handlers, forms, frames and
 *    every URL that is not http(s), mailto or an in-document `#anchor`;
 *  - images must be `data:` — the ones mammoth embeds from the document.
 *    A remote `src` would report that you opened the file;
 *  - links open in a new tab with no opener and no referrer.
 *
 * Browser-only: DOMPurify needs a DOM, and the viewer runs client-side.
 */

const ALLOWED_URI = /^(?:https?:|mailto:|#)/i;

type Purifier = ReturnType<typeof DOMPurify>;
let purifier: Purifier | null = null;

/** A private instance, so the hook below never leaks into other DOMPurify users. */
function getPurifier(): Purifier {
	if (purifier) return purifier;
	purifier = DOMPurify(window);
	purifier.addHook('afterSanitizeAttributes', (node) => {
		if (node.nodeName === 'IMG') {
			const src = node.getAttribute('src') ?? '';
			if (!/^data:image\//i.test(src)) node.removeAttribute('src');
			node.removeAttribute('srcset');
		}
		if (node.nodeName === 'A' && node.hasAttribute('href')) {
			const href = node.getAttribute('href') ?? '';
			if (!href.startsWith('#')) {
				node.setAttribute('target', '_blank');
				node.setAttribute('rel', 'noopener noreferrer');
			}
		}
	});
	return purifier;
}

export function sanitizeDocxHtml(html: string): string {
	return getPurifier().sanitize(html, {
		USE_PROFILES: { html: true },
		ALLOWED_URI_REGEXP: ALLOWED_URI,
		FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'option'],
		FORBID_ATTR: ['style'],
		ADD_ATTR: ['target']
	});
}

import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS = [
	'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre', 'blockquote',
	'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
	'a', 'hr', 'span', 'div',
	'table', 'thead', 'tbody', 'tr', 'th', 'td'
];

const ALLOWED_ATTRS = {
	a: ['href', 'title'],
	span: ['style'],
	div: ['style']
};

const ALLOWED_SCHEMES = ['http', 'https', 'mailto'];

export function markdownToSafeHtml(md: string): string {
	const raw = marked.parse(md, { gfm: true, breaks: false, async: false }) as string;
	return sanitizeHtml(raw, {
		allowedTags: ALLOWED_TAGS,
		allowedAttributes: ALLOWED_ATTRS,
		allowedSchemes: ALLOWED_SCHEMES
	});
}

export function markdownToText(md: string): string {
	const html = markdownToSafeHtml(md);
	return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
		.replace(/\s+/g, ' ')
		.trim();
}

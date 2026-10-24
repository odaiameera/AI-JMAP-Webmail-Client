// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import mammoth from 'mammoth';
import { sanitizeDocxHtml } from './docx-html';

/** A real .docx whose only hyperlink points at `javascript:alert(document.cookie)`. */
// From the repo root: under jsdom, import.meta.url is not a file: URL.
const JS_LINK_DOCX = resolve(process.cwd(), 'src/lib/utils/__fixtures__/js-link.docx');

describe('sanitizeDocxHtml', () => {
	it('strips the javascript: link mammoth emits for a hostile .docx', async () => {
		const { value } = await mammoth.convertToHtml({ buffer: readFileSync(JS_LINK_DOCX) });
		// The bug: mammoth passes the link target through untouched.
		expect(value).toContain('href="javascript:');

		const clean = sanitizeDocxHtml(value);
		expect(clean).not.toMatch(/javascript:/i);
		expect(clean).toContain('Open invoice');
		expect(clean).toContain('Invoice attached.');
	});

	it('drops scripts, event handlers and script-bearing URLs', () => {
		const clean = sanitizeDocxHtml(
			'<p onclick="alert(1)">a</p><script>alert(2)</script>' +
				'<img src="x" onerror="alert(3)"><a href=" JaVaScRiPt:alert(4)">b</a>' +
				'<a href="data:text/html,<script>alert(5)</script>">c</a>' +
				'<iframe src="https://evil.test"></iframe><form action="https://evil.test"><input></form>' +
				'<svg><a href="javascript:alert(6)"><text>d</text></a></svg>'
		);
		expect(clean).not.toMatch(/onclick|onerror|<script|<iframe|<form|<input|javascript:|data:text/i);
	});

	it('keeps embedded images but not remote ones, which would beacon on open', () => {
		const clean = sanitizeDocxHtml(
			'<img src="data:image/png;base64,iVBORw0KGgo=" alt="chart"><img src="https://tracker.test/p.gif">'
		);
		expect(clean).toContain('src="data:image/png;base64,iVBORw0KGgo="');
		expect(clean).not.toContain('tracker.test');
	});

	it('keeps ordinary formatting and opens web links safely in a new tab', () => {
		const clean = sanitizeDocxHtml(
			'<h1>Title</h1><p><strong>bold</strong> <em>it</em></p><ul><li>one</li></ul>' +
				'<table><tr><td>cell</td></tr></table><a href="https://example.test/page">site</a>' +
				'<a href="mailto:a@example.test">mail</a><a href="#_ftn1">note</a>'
		);
		expect(clean).toContain('<h1>Title</h1>');
		expect(clean).toContain('<strong>bold</strong>');
		expect(clean).toContain('<td>cell</td>');
		expect(clean).toMatch(/<a href="https:\/\/example\.test\/page"[^>]*target="_blank"/);
		expect(clean).toMatch(/<a href="https:\/\/example\.test\/page"[^>]*rel="noopener noreferrer"/);
		expect(clean).toContain('href="mailto:a@example.test"');
		expect(clean).toContain('href="#_ftn1"');
	});
});

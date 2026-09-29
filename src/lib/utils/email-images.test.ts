import { describe, expect, it } from 'vitest';
import type { EmailAttachment } from '$lib/jmap/types';
import { proxiedImageUrl, rewriteEmailImages } from './email-images';

const ctx = (attachments: Partial<EmailAttachment>[] = []) => ({
	emailId: 'M1',
	attachments: attachments as EmailAttachment[]
});

const proxied = (url: string) => proxiedImageUrl(url).replace(/&/g, '&amp;');

describe('rewriteEmailImages', () => {
	it('routes a remote image through the proxy, decoding entities in the URL', () => {
		const html = '<img src="https://media.licdn.com/dms/image/x?e=1&amp;v=beta" alt="Farah">';
		expect(rewriteEmailImages(html, ctx())).toBe(
			`<img src="${proxied('https://media.licdn.com/dms/image/x?e=1&v=beta')}" alt="Farah">`
		);
	});

	it('encodes the target so it is safe in every context', () => {
		expect(proxiedImageUrl("https://x.test/a b(1)'.png?a=1&b=2")).toBe(
			'/api/image-proxy?url=https%3A%2F%2Fx.test%2Fa%20b%281%29%27.png%3Fa%3D1%26b%3D2'
		);
	});

	it('handles unquoted, single-quoted, protocol-relative and http URLs', () => {
		const out = rewriteEmailImages(
			"<img src=https://a.test/1.png><img src='//b.test/2.png'><img src=\"http://c.test/3.png\">",
			ctx()
		);
		expect(out).toContain(`src="${proxied('https://a.test/1.png')}"`);
		expect(out).toContain(`src="${proxied('https://b.test/2.png')}"`);
		expect(out).toContain(`src="${proxied('http://c.test/3.png')}"`);
	});

	it('rewrites every srcset candidate and keeps the descriptors', () => {
		const out = rewriteEmailImages(
			'<picture><source srcset="https://a.test/1.png 1x, https://a.test/2.png 2x"><img src="https://a.test/1.png"></picture>',
			ctx()
		);
		expect(out).toContain(
			`srcset="${proxied('https://a.test/1.png')} 1x, ${proxied('https://a.test/2.png')} 2x"`
		);
	});

	it('rewrites background attributes and CSS backgrounds in style attributes', () => {
		const out = rewriteEmailImages(
			'<td background="https://a.test/bg.png" style="background-image:url(&quot;https://a.test/s.png&quot;);color:red">x</td>',
			ctx()
		);
		expect(out).toContain(`background="${proxied('https://a.test/bg.png')}"`);
		expect(out).toContain(
			`style="background-image:url(&quot;${proxiedImageUrl('https://a.test/s.png').replace(/&/g, '&amp;')}&quot;);color:red"`
		);
	});

	it('rewrites images in <style> but leaves fonts and imported stylesheets alone', () => {
		const css =
			"@import url('https://fonts.googleapis.com/css?family=Inter');" +
			"@font-face{font-family:X;src:url(https://fonts.test/x.woff2)}" +
			".hero{background:url('https://a.test/hero.jpg')}";
		const out = rewriteEmailImages(`<style>${css}</style>`, ctx());
		expect(out).toContain("@import url('https://fonts.googleapis.com/css?family=Inter');");
		expect(out).toContain('src:url(https://fonts.test/x.woff2)');
		expect(out).toContain(`.hero{background:url("${proxiedImageUrl('https://a.test/hero.jpg')}")}`);
	});

	it('resolves cid: images to the inline part', () => {
		const out = rewriteEmailImages('<img src="cid:logo@example.com"><img src="cid:missing">', ctx([
			{ cid: 'logo@example.com', blobId: 'B9', name: 'logo.png', type: 'image/png', disposition: 'inline' }
		]));
		expect(out).toContain('src="/api/email/M1/attachment/B9?name=logo.png&amp;disposition=inline"');
		expect(out).toContain('src="cid:missing"');
	});

	it('leaves data: URLs, relative paths, links and lookalike attributes untouched', () => {
		const html =
			'<img src="data:image/png;base64,AAAA"><img src="/local.png" data-src="https://a.test/x.png">' +
			'<a href="https://a.test/page">link</a>';
		expect(rewriteEmailImages(html, ctx())).toBe(html);
	});

	it('does not stop at a ">" inside a quoted attribute', () => {
		const out = rewriteEmailImages('<img alt="a > b" src="https://a.test/1.png">', ctx());
		expect(out).toBe(`<img alt="a > b" src="${proxied('https://a.test/1.png')}">`);
	});

	it('drops a sender <base> and resolves relative images against it', () => {
		const out = rewriteEmailImages(
			'<base href="https://news.test/mail/"><img src="img/1.png"><a href="x">x</a>',
			ctx()
		);
		expect(out).not.toContain('<base');
		expect(out).toContain(`src="${proxied('https://news.test/mail/img/1.png')}"`);
	});
});

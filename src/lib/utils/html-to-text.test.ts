import { describe, expect, it } from 'vitest';
import { htmlToText } from './html-to-text';

describe('htmlToText', () => {
	it('turns paragraphs and line breaks into newlines', () => {
		expect(htmlToText('<p>Hi Dana,</p><p>Line one<br>Line two</p>')).toBe('Hi Dana,\n\nLine one\nLine two');
	});

	it('keeps link targets, without repeating a bare URL', () => {
		expect(htmlToText('<p>See <a href="https://x.test/a">the doc</a> or https://x.test/b</p>')).toBe(
			'See the doc (https://x.test/a) or https://x.test/b'
		);
		expect(htmlToText('<a href="https://x.test">https://x.test</a>')).toBe('https://x.test');
		expect(htmlToText('<a href="mailto:a@b.test">a@b.test</a>')).toBe('a@b.test');
	});

	it('bullets list items', () => {
		expect(htmlToText('<ul><li>One</li><li>Two</li></ul>')).toBe('• One\n• Two');
	});

	it('quotes replies with > per level', () => {
		const html = '<p>Thanks!</p><blockquote><p>Original</p><blockquote><p>Older</p></blockquote></blockquote>';
		expect(htmlToText(html)).toBe('Thanks!\n\n> Original\n>\n> > Older');
	});

	it('decodes entities and drops styles and comments', () => {
		expect(htmlToText('<style>p{color:red}</style><!-- x --><p>Fish &amp; chips&nbsp;&#8212; &lt;3</p>')).toBe(
			'Fish & chips — <3'
		);
	});

	it('ignores source newlines inside text', () => {
		expect(htmlToText('<p>one\ntwo</p>')).toBe('one two');
	});
});

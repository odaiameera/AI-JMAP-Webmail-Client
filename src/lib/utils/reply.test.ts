import { describe, expect, it } from 'vitest';
import { escapeHtml, prefixedSubject, replyRecipients, threadHeaders } from './reply';

const me = ['odai@example.test', 'alias@example.test'];
const a = (email: string, name: string | null = null) => ({ name, email });

describe('threadHeaders', () => {
	it('uses Message-IDs, chaining the parent References and its own id', () => {
		expect(threadHeaders({ messageId: ['m3@x'], references: ['m1@x', 'm2@x'], inReplyTo: ['m2@x'] })).toEqual({
			inReplyTo: 'm3@x',
			references: 'm1@x m2@x m3@x'
		});
	});

	it('falls back to In-Reply-To when the parent has no References', () => {
		expect(threadHeaders({ messageId: ['m2@x'], references: null, inReplyTo: ['m1@x'] })).toEqual({
			inReplyTo: 'm2@x',
			references: 'm1@x m2@x'
		});
	});

	it('produces nothing rather than a JMAP id when there is no Message-ID', () => {
		expect(threadHeaders({ messageId: null, references: null, inReplyTo: null })).toEqual({ inReplyTo: '', references: '' });
	});
});

describe('replyRecipients', () => {
	const msg = {
		from: [a('dana@x.test', 'Dana')],
		to: [a('odai@example.test'), a('sam@x.test')],
		cc: [a('Lee@x.test'), a('alias@example.test')],
		replyTo: null
	};

	it('replies to the sender', () => {
		expect(replyRecipients(msg, me, false)).toEqual({ to: [a('dana@x.test', 'Dana')], cc: [] });
	});

	it('honours Reply-To', () => {
		expect(replyRecipients({ ...msg, replyTo: [a('list@x.test')] }, me, false).to).toEqual([a('list@x.test')]);
	});

	it('reply all copies everyone else and never your own addresses', () => {
		expect(replyRecipients(msg, me, true)).toEqual({
			to: [a('dana@x.test', 'Dana')],
			cc: [a('sam@x.test'), a('Lee@x.test')]
		});
	});

	it('replying to your own sent message goes back to the people you wrote to', () => {
		const sent = { from: [a('odai@example.test')], to: [a('dana@x.test'), a('sam@x.test')], cc: [a('lee@x.test')], replyTo: null };
		expect(replyRecipients(sent, me, true)).toEqual({
			to: [a('dana@x.test'), a('sam@x.test')],
			cc: [a('lee@x.test')]
		});
	});

	it('matches addresses case-insensitively and does not repeat To in Cc', () => {
		const m = { from: [a('Dana@X.test')], to: [a('dana@x.test')], cc: [a('ODAI@example.test')], replyTo: null };
		expect(replyRecipients(m, me, true)).toEqual({ to: [a('Dana@X.test')], cc: [] });
	});

	it('a note to yourself still has somewhere to go', () => {
		const self = { from: [a('odai@example.test')], to: [a('odai@example.test')], cc: null, replyTo: null };
		expect(replyRecipients(self, me, false).to).toEqual([a('odai@example.test')]);
	});
});

describe('prefixedSubject', () => {
	it('adds Re:/Fwd: once', () => {
		expect(prefixedSubject('Hello', 'reply')).toBe('Re: Hello');
		expect(prefixedSubject('RE: Hello', 'reply')).toBe('RE: Hello');
		expect(prefixedSubject('Fw: Hello', 'forward')).toBe('Fw: Hello');
		expect(prefixedSubject(null, 'forward')).toBe('Fwd: ');
	});
});

describe('escapeHtml', () => {
	it('escapes markup characters', () => {
		expect(escapeHtml('<b>"A&B"</b>')).toBe('&lt;b&gt;&quot;A&amp;B&quot;&lt;/b&gt;');
	});
});

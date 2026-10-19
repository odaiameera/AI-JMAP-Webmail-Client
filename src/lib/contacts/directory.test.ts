import { describe, expect, it } from 'vitest';
import { buildDirectory, nameForAddress, suggestRecipients } from './directory';
import type { ContactCard } from '$lib/jmap/types';

const card = (id: string, name: string, emails: string[]): ContactCard =>
	({
		id,
		uid: `urn:uuid:${id}`,
		'@type': 'Card',
		version: '1.0',
		addressBookIds: { b: true },
		name: { full: name },
		emails: Object.fromEntries(emails.map((address, i) => [`e${i}`, { address }]))
	}) as ContactCard;

const directory = buildDirectory(
	[card('1', 'Dana Wade', ['dana@x.test', 'd.wade@work.test']), card('2', 'Sam Lee', ['sam@x.test']), card('3', 'No Mail', [])],
	[
		{ id: 'L1', uid: 'urn:uuid:L1', name: 'Family', memberUids: ['urn:uuid:1', 'urn:uuid:2', 'urn:uuid:3'], addressBookIds: {} },
		{ id: 'L2', uid: 'urn:uuid:L2', name: 'Empty', memberUids: ['urn:uuid:3'], addressBookIds: {} }
	]
);

describe('buildDirectory', () => {
	it('lists every address of every contact, and lists by their members’ primary address', () => {
		expect(directory.people).toEqual([
			{ name: 'Dana Wade', email: 'dana@x.test' },
			{ name: 'Dana Wade', email: 'd.wade@work.test' },
			{ name: 'Sam Lee', email: 'sam@x.test' }
		]);
		expect(directory.lists[0]).toEqual({ id: 'L1', name: 'Family', emails: ['dana@x.test', 'sam@x.test'] });
	});
});

describe('suggestRecipients', () => {
	it('suggests a matching list first, with everyone in it', () => {
		const [first] = suggestRecipients(directory, 'fam', new Set(), []);
		expect(first).toEqual({ kind: 'list', id: 'L1', name: 'Family', emails: ['dana@x.test', 'sam@x.test'] });
	});

	it('matches contacts by name or address and leaves out lists with no addresses', () => {
		expect(suggestRecipients(directory, 'emp', new Set(), [])).toEqual([]);
		expect(suggestRecipients(directory, 'wade', new Set(), []).map((s) => s.kind === 'person' && s.email)).toEqual([
			'dana@x.test',
			'd.wade@work.test'
		]);
	});

	it('skips addresses already on the message and adds recent non-contacts last', () => {
		const result = suggestRecipients(directory, 'sa', new Set(['sam@x.test']), ['sara@else.test', 'sam@x.test']);
		expect(result.map((s) => (s.kind === 'person' ? s.email : s.name))).toEqual(['sara@else.test']);
	});

	it('suggests nothing for an empty query', () => {
		expect(suggestRecipients(directory, '  ', new Set(), ['a@b.test'])).toEqual([]);
	});
});

describe('nameForAddress', () => {
	it('finds the contact name for an address, case-insensitively', () => {
		expect(nameForAddress(directory, 'DANA@x.test')).toBe('Dana Wade');
		expect(nameForAddress(directory, 'who@x.test')).toBe('');
	});
});

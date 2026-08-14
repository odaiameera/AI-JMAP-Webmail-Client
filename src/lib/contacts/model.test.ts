import { describe, expect, it } from 'vitest';
import type { ContactCard } from '$lib/jmap/types';
import {
	contactDisplayName,
	contactPrimaryEmail,
	contactToForm,
	groupContactsAlphabetically
} from './model';

const ada: ContactCard = {
	id: 'contact-1',
	'@type': 'Card',
	version: '1.0',
	uid: 'urn:uuid:ada',
	kind: 'individual',
	name: { full: 'Ada Lovelace' },
	emails: {
		secondary: { address: 'home@example.test', contexts: { private: true } },
		primary: { address: 'ada@example.test', contexts: { work: true }, pref: 1 }
	},
	phones: {
		mobile: { number: '+353 87 555 0100', contexts: { private: true }, pref: 1 }
	},
	organizations: { org1: { name: 'Analytical Engine' } },
	notes: { note1: { note: 'First programmer' } },
	keywords: { favorite: true },
	addressBookIds: { 'book-1': true }
};

describe('contact view model', () => {
	it('preserves all supported values when opening a contact for editing', () => {
		expect(contactToForm(ada)).toEqual({
			name: 'Ada Lovelace',
			emails: [
				{ id: 'primary', address: 'ada@example.test', type: 'work', pref: 1 },
				{ id: 'secondary', address: 'home@example.test', type: 'home' }
			],
			phones: [{ id: 'mobile', number: '+353 87 555 0100', type: 'home', pref: 1 }],
			organization: 'Analytical Engine',
			organizationId: 'org1',
			notes: 'First programmer',
			noteId: 'note1',
			favorite: true,
			addressBookIds: ['book-1']
		});
	});

	it('uses safe fallbacks for unnamed contacts', () => {
		const contact: ContactCard = {
			...ada,
			name: undefined,
			organizations: undefined,
			emails: { email1: { address: 'person@example.test' } }
		};
		expect(contactDisplayName(contact)).toBe('person@example.test');
		expect(contactPrimaryEmail(contact)).toBe('person@example.test');
	});

	it('sorts contacts locale-aware and groups non-letter names under #', () => {
		const numeric = { ...ada, id: 'numeric', name: { full: '123 Services' } };
		const grace = { ...ada, id: 'grace', name: { full: 'Grace Hopper' } };
		expect(groupContactsAlphabetically([grace, numeric, ada])).toEqual([
			{ letter: '#', contacts: [numeric] },
			{ letter: 'A', contacts: [ada] },
			{ letter: 'G', contacts: [grace] }
		]);
	});
});

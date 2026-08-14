import type { ContactCard, JSContactEmail, JSContactPhone } from '$lib/jmap/types';

export type ContactEntryType = 'home' | 'work' | 'other';

export interface ContactEmailFormValue {
	id?: string;
	address: string;
	type: ContactEntryType;
	pref?: number;
}

export interface ContactPhoneFormValue {
	id?: string;
	number: string;
	type: ContactEntryType;
	pref?: number;
}

export interface ContactFormValue {
	name: string;
	emails: ContactEmailFormValue[];
	phones: ContactPhoneFormValue[];
	organization: string;
	organizationId?: string;
	notes: string;
	noteId?: string;
	favorite: boolean;
	addressBookIds: string[];
}

export interface ContactGroup {
	letter: string;
	contacts: ContactCard[];
}

function entryType(entry: JSContactEmail | JSContactPhone): ContactEntryType {
	if (entry.contexts?.work) return 'work';
	if (entry.contexts?.private) return 'home';
	return 'other';
}

function byPreference<T extends { pref?: number }>(entries: T[]): T[] {
	return entries.sort((left, right) => (left.pref ?? Number.MAX_SAFE_INTEGER) - (right.pref ?? Number.MAX_SAFE_INTEGER));
}

function entriesByPreference<T extends { pref?: number }>(entries: Array<[string, T]>): Array<[string, T]> {
	return entries.sort(([, left], [, right]) =>
		(left.pref ?? Number.MAX_SAFE_INTEGER) - (right.pref ?? Number.MAX_SAFE_INTEGER)
	);
}

export function contactEmails(contact: ContactCard): JSContactEmail[] {
	return byPreference(Object.values(contact.emails ?? {}));
}

export function contactPhones(contact: ContactCard): JSContactPhone[] {
	return byPreference(Object.values(contact.phones ?? {}));
}

export function contactPrimaryEmail(contact: ContactCard): string {
	return contactEmails(contact)[0]?.address ?? '';
}

export function contactDisplayName(contact: ContactCard): string {
	const name = contact.name?.full?.trim();
	if (name) return name;
	const organization = Object.values(contact.organizations ?? {})[0]?.name?.trim();
	if (organization) return organization;
	return contactPrimaryEmail(contact) || contactPhones(contact)[0]?.number || 'Unnamed contact';
}

export function contactToForm(contact: ContactCard): ContactFormValue {
	const organizations = Object.entries(contact.organizations ?? {});
	const notes = Object.entries(contact.notes ?? {});
	return {
		name: contact.name?.full?.trim() ?? '',
		emails: entriesByPreference(Object.entries(contact.emails ?? {})).map(([id, entry]) => ({
			id,
			address: entry.address,
			type: entryType(entry),
			...(entry.pref !== undefined && { pref: entry.pref })
		})),
		phones: entriesByPreference(Object.entries(contact.phones ?? {})).map(([id, entry]) => ({
			id,
			number: entry.number,
			type: entryType(entry),
			...(entry.pref !== undefined && { pref: entry.pref })
		})),
		organization: organizations[0]?.[1].name?.trim() ?? '',
		organizationId: organizations[0]?.[0],
		notes: notes[0]?.[1].note?.trim() ?? '',
		noteId: notes[0]?.[0],
		favorite: contact.keywords?.favorite === true,
		addressBookIds: Object.entries(contact.addressBookIds)
			.filter(([, included]) => included)
			.map(([id]) => id)
	};
}

export function emptyContactForm(addressBookId = ''): ContactFormValue {
	return {
		name: '',
		emails: [{ address: '', type: 'other' }],
		phones: [],
		organization: '',
		notes: '',
		favorite: false,
		addressBookIds: addressBookId ? [addressBookId] : []
	};
}

export function groupContactsAlphabetically(contacts: ContactCard[]): ContactGroup[] {
	const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
	const groups = new Map<string, ContactCard[]>();
	for (const contact of [...contacts].sort((left, right) =>
		collator.compare(contactDisplayName(left), contactDisplayName(right))
	)) {
		const first = contactDisplayName(contact).trim().charAt(0).toUpperCase();
		const letter = /^\p{L}$/u.test(first) ? first : '#';
		const group = groups.get(letter) ?? [];
		group.push(contact);
		groups.set(letter, group);
	}
	return [...groups.entries()]
		.sort(([left], [right]) => {
			if (left === '#') return -1;
			if (right === '#') return 1;
			return collator.compare(left, right);
		})
		.map(([letter, groupedContacts]) => ({ letter, contacts: groupedContacts }));
}

import type { ContactCard } from '$lib/jmap/types';
import type { ContactList } from '$lib/jmap/contacts';
import { contactEmails, contactPrimaryEmail } from './model';

/**
 * The address book as the composer sees it: every address a contact has,
 * with the contact's name, and every contact list with its members'
 * addresses. Recipient suggestions and the names on recipient chips come
 * from here.
 */
export interface DirectoryPerson {
	name: string;
	email: string;
}

export interface DirectoryList {
	id: string;
	name: string;
	emails: string[];
}

export interface Directory {
	people: DirectoryPerson[];
	lists: DirectoryList[];
}

export type Suggestion =
	| { kind: 'person'; name: string; email: string }
	| { kind: 'list'; id: string; name: string; emails: string[] };

export function buildDirectory(contacts: ContactCard[], lists: ContactList[]): Directory {
	const people: DirectoryPerson[] = [];
	const primaryByUid = new Map<string, string>();
	for (const contact of contacts) {
		const name = contact.name?.full?.trim() ?? '';
		for (const e of contactEmails(contact)) {
			if (e.address?.trim()) people.push({ name, email: e.address.trim() });
		}
		const primary = contactPrimaryEmail(contact);
		if (contact.uid && primary) primaryByUid.set(contact.uid, primary);
	}
	return {
		people,
		lists: lists.map((list) => ({
			id: list.id,
			name: list.name,
			emails: list.memberUids.map((uid) => primaryByUid.get(uid)).filter((e): e is string => !!e)
		}))
	};
}

const lower = (s: string) => s.toLowerCase();

/** Better when the query starts a word of the text than when it's buried in it. */
function score(text: string, q: string): number {
	const t = lower(text);
	if (!t.includes(q)) return 0;
	if (t.startsWith(q)) return 3;
	if (new RegExp(`[\\s.@_-]${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(t)) return 2;
	return 1;
}

/**
 * Suggestions for what's been typed: matching lists first (a list adds
 * everyone in it), then contacts by name or address, then recently used
 * addresses that aren't contacts. Addresses already on the message are
 * left out.
 */
export function suggestRecipients(
	directory: Directory,
	query: string,
	chosen: Set<string>,
	recent: string[],
	limit = 8
): Suggestion[] {
	const q = lower(query.trim());
	if (!q) return [];

	const lists = directory.lists
		.filter((l) => l.emails.length > 0 && score(l.name, q) > 0)
		.sort((a, b) => score(b.name, q) - score(a.name, q))
		.slice(0, 3)
		.map((l): Suggestion => ({ kind: 'list', id: l.id, name: l.name, emails: l.emails }));

	const seen = new Set(chosen);
	const people = directory.people
		.map((p) => ({ p, s: Math.max(score(p.name, q), score(p.email, q)) }))
		.filter(({ p, s }) => s > 0 && !seen.has(lower(p.email)))
		.sort((a, b) => b.s - a.s)
		.filter(({ p }) => {
			if (seen.has(lower(p.email))) return false;
			seen.add(lower(p.email));
			return true;
		})
		.map(({ p }): Suggestion => ({ kind: 'person', name: p.name, email: p.email }));

	const others = recent
		.filter((e) => score(e, q) > 0 && !seen.has(lower(e)))
		.map((email): Suggestion => ({ kind: 'person', name: '', email }));

	return [...lists, ...people, ...others].slice(0, limit);
}

/** The contact name for an address, or '' when it isn't a contact. */
export function nameForAddress(directory: Directory, email: string): string {
	const e = lower(email.trim());
	return directory.people.find((p) => lower(p.email) === e && p.name)?.name ?? '';
}

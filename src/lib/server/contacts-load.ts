import { createClient, fetchSession } from '$lib/jmap/auth';
import {
	ContactsUnsupportedError,
	getAddressBooks,
	queryContactLists,
	queryContacts,
	resolveContactsAccount
} from '$lib/jmap/contacts';
import type { AuthState } from '$lib/jmap/types';
import type { ContactsLoadResponse } from '$lib/contacts/api';

const UNSUPPORTED: ContactsLoadResponse = {
	supported: false,
	capabilities: null,
	addressBooks: [],
	contacts: [],
	queryState: '',
	total: 0,
	listsSupported: false,
	lists: []
};

/**
 * One page of the address book, as GET /api/contacts returns it: address
 * books, a page of people, and (on the first page) the contact lists.
 * An account without JMAP Contacts gets the "not supported" shape.
 */
export async function loadContactsPage(
	auth: AuthState,
	{ query = '', limit = 100, position = 0 }: { query?: string; limit?: number; position?: number } = {}
): Promise<ContactsLoadResponse> {
	try {
		const session = await fetchSession(auth);
		const { accountId, capabilities } = resolveContactsAccount(session);
		const client = createClient(auth);
		const [addressBooks, result, lists] = await Promise.all([
			getAddressBooks(client, accountId),
			queryContacts(client, accountId, query, limit, position),
			// Only the first page carries the lists; the client pages through
			// contacts but needs the lists once.
			position === 0 ? queryContactLists(client, accountId) : Promise.resolve(null)
		]);
		return {
			supported: true,
			capabilities,
			addressBooks,
			...result,
			listsSupported: true,
			lists: lists ?? []
		};
	} catch (error) {
		if (error instanceof ContactsUnsupportedError) return UNSUPPORTED;
		throw error;
	}
}

/**
 * The whole address book, for the Contacts page to arrive with: the first
 * page and then the rest, the way the browser used to page through it.
 */
export async function loadAllContacts(auth: AuthState): Promise<ContactsLoadResponse> {
	const first = await loadContactsPage(auth);
	// Pages advance by cards consumed, not people returned: lists sit on the
	// same pages but are kept out of `contacts`.
	const consumed = (page: ContactsLoadResponse) => page.fetched ?? page.contacts.length;
	if (!first.supported || consumed(first) >= first.total) return first;

	const session = await fetchSession(auth);
	const { accountId } = resolveContactsAccount(session);
	const client = createClient(auth);
	const contacts = [...first.contacts];
	const seen = new Set(contacts.map((c) => c.id));
	let position = consumed(first);
	let queryState = first.queryState;
	while (position < first.total) {
		const page = await queryContacts(client, accountId, '', 100, position);
		const used = page.fetched ?? page.contacts.length;
		if (used === 0) break;
		for (const c of page.contacts) {
			if (!seen.has(c.id)) {
				seen.add(c.id);
				contacts.push(c);
			}
		}
		position += used;
		queryState = page.queryState;
	}
	return { ...first, contacts, queryState };
}

import { writable } from 'svelte/store';
import { apiLoadContacts } from '$lib/contacts/api';
import { buildDirectory, type Directory } from '$lib/contacts/directory';

/**
 * The address book for recipient suggestions, loaded on first use and
 * refreshed at most every few minutes. A failed load leaves suggestions
 * on recent addresses only; it never blocks typing an address.
 */
const store = writable<Directory>({ people: [], lists: [] });
const FRESH_MS = 5 * 60_000;
let loadedAt = 0;
let inFlight: Promise<void> | null = null;

export const addressBook = { subscribe: store.subscribe };

export function loadAddressBook(): Promise<void> {
	if (Date.now() - loadedAt < FRESH_MS) return Promise.resolve();
	if (inFlight) return inFlight;
	inFlight = (async () => {
		try {
			const data = await apiLoadContacts('');
			if (data.supported) {
				store.set(buildDirectory(data.contacts, data.lists ?? []));
				loadedAt = Date.now();
			}
		} catch {
			// Suggestions fall back to recent addresses.
		} finally {
			inFlight = null;
		}
	})();
	return inFlight;
}

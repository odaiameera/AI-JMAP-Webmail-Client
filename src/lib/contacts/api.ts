import type { AddressBook, ContactCard } from '$lib/jmap/types';
import type { ContactsAccountCapabilities } from '$lib/jmap/contacts';
import type { ContactFormValue } from './model';

export interface ContactsLoadResponse {
	supported: boolean;
	capabilities: ContactsAccountCapabilities | null;
	addressBooks: AddressBook[];
	contacts: ContactCard[];
	queryState: string;
	total: number;
}

interface MutationResponse {
	success?: boolean;
	contact?: ContactCard;
	error?: string;
	failures?: unknown[];
}

export class ContactsApiError extends Error {
	constructor(
		message: string,
		public status: number,
		public failures: unknown[] = []
	) {
		super(message);
		this.name = 'ContactsApiError';
	}
}

async function readJson<T>(response: Response, fallback: string): Promise<T> {
	const data = (await response.json().catch(() => ({}))) as T & {
		error?: string;
		failures?: unknown[];
	};
	if (!response.ok) {
		throw new ContactsApiError(data.error ?? fallback, response.status, data.failures ?? []);
	}
	return data;
}

async function loadContactsPage(
	query: string,
	limit: number,
	position: number,
	signal?: AbortSignal
): Promise<ContactsLoadResponse> {
	const params = new URLSearchParams({
		q: query.trim().slice(0, 255),
		limit: String(limit),
		position: String(position)
	});
	const response = await fetch(`/api/contacts?${params}`, {
		headers: { Accept: 'application/json' },
		signal
	});
	return readJson<ContactsLoadResponse>(response, 'Unable to load contacts');
}

export async function apiLoadContacts(
	query = '',
	options: { limit?: number; position?: number; signal?: AbortSignal } = {}
): Promise<ContactsLoadResponse> {
	const pageSize = Math.min(100, Math.max(1, options.limit ?? 100));
	const startPosition = Math.max(0, options.position ?? 0);
	const first = await loadContactsPage(query, pageSize, startPosition, options.signal);
	if (!first.supported || startPosition + first.contacts.length >= first.total) return first;

	const contacts = [...first.contacts];
	const seenIds = new Set(contacts.map((contact) => contact.id));
	let position = startPosition + first.contacts.length;
	let queryState = first.queryState;
	while (position < first.total) {
		const page = await loadContactsPage(query, pageSize, position, options.signal);
		if (!page.supported || page.contacts.length === 0) break;
		for (const contact of page.contacts) {
			if (!seenIds.has(contact.id)) {
				seenIds.add(contact.id);
				contacts.push(contact);
			}
		}
		position += page.contacts.length;
		queryState = page.queryState;
	}
	return { ...first, contacts, queryState };
}

export async function apiCreateContact(form: ContactFormValue): Promise<ContactCard> {
	const response = await fetch('/api/contacts', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
		body: JSON.stringify({ action: 'create', contact: form })
	});
	const data = await readJson<MutationResponse>(response, 'Unable to create contact');
	if (!data.contact) {
		throw new ContactsApiError('The server did not return the created contact', 502);
	}
	return data.contact;
}

export interface ContactsImportResponse {
	success: boolean;
	imported: number;
	failed: number;
	created: Array<{ index: number; contact: ContactCard }>;
	failures: Array<{ index: number; error: string; type?: string; properties?: string[] }>;
}

export async function apiImportContacts(forms: ContactFormValue[]): Promise<ContactsImportResponse> {
	if (forms.length === 0 || forms.length > 50) {
		throw new ContactsApiError('Import batches must contain between 1 and 50 contacts', 400);
	}
	const response = await fetch('/api/contacts', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
		body: JSON.stringify({ action: 'import', contacts: forms })
	});
	return readJson<ContactsImportResponse>(response, 'Unable to import contacts');
}

export async function apiUpdateContact(id: string, form: ContactFormValue): Promise<void> {
	const response = await fetch('/api/contacts', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
		body: JSON.stringify({ action: 'update', id, contact: form })
	});
	await readJson<MutationResponse>(response, 'Unable to update contact');
}

export async function apiDeleteContact(id: string): Promise<void> {
	const response = await fetch('/api/contacts', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
		body: JSON.stringify({ action: 'delete', id })
	});
	await readJson<MutationResponse>(response, 'Unable to delete contact');
}

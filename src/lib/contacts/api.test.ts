import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContactsApiError, apiCreateContact, apiImportContacts, apiLoadContacts } from './api';
import type { ContactFormValue } from './model';

afterEach(() => vi.unstubAllGlobals());

const form: ContactFormValue = {
	name: 'Ada Lovelace',
	emails: [{ address: 'ada@example.test', type: 'work' }],
	phones: [],
	organization: '',
	notes: '',
	favorite: false,
	addressBookIds: ['book-1']
};

describe('contacts API client', () => {
	it('encodes bounded search parameters and returns the typed payload', async () => {
		const payload = {
			supported: true,
			capabilities: {},
			addressBooks: [],
			contacts: [],
			queryState: 'state-1',
			total: 0
		};
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify(payload), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		vi.stubGlobal('fetch', fetchMock);

		await expect(apiLoadContacts('Ada & Bob')).resolves.toEqual(payload);
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/contacts?q=Ada+%26+Bob&limit=100&position=0',
			expect.objectContaining({ headers: { Accept: 'application/json' } })
		);
	});

	it('loads every contact page so the list and import duplicate detection are complete', async () => {
		const firstContacts = Array.from({ length: 100 }, (_, index) => ({
			id: `contact-${index}`,
			'@type': 'Card',
			version: '1.0',
			uid: `urn:uuid:${index}`,
			addressBookIds: { book: true }
		}));
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify({
				supported: true,
				capabilities: {},
				addressBooks: [],
				contacts: firstContacts,
				queryState: 'state-1',
				total: 101
			}), { status: 200, headers: { 'Content-Type': 'application/json' } }))
			.mockResolvedValueOnce(new Response(JSON.stringify({
				supported: true,
				capabilities: {},
				addressBooks: [],
				contacts: [{
					id: 'contact-100',
					'@type': 'Card',
					version: '1.0',
					uid: 'urn:uuid:100',
					addressBookIds: { book: true }
				}],
				queryState: 'state-1',
				total: 101
			}), { status: 200, headers: { 'Content-Type': 'application/json' } }));
		vi.stubGlobal('fetch', fetchMock);

		const result = await apiLoadContacts('');

		expect(result.contacts).toHaveLength(101);
		expect(fetchMock).toHaveBeenNthCalledWith(
			2,
			'/api/contacts?q=&limit=100&position=100',
			expect.objectContaining({ headers: { Accept: 'application/json' } })
		);
	});

	it('sends normalized form data without constructing SMTP address strings', async () => {
		const contact = { id: 'contact-1' };
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ success: true, contact }), {
				status: 201,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		vi.stubGlobal('fetch', fetchMock);

		await expect(apiCreateContact(form)).resolves.toEqual(contact);
		expect(fetchMock).toHaveBeenCalledWith('/api/contacts', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
			body: JSON.stringify({ action: 'create', contact: form })
		});
	});

	it('preserves actionable server validation failures', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(JSON.stringify({ error: 'Invalid email address' }), {
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				})
			)
		);

		await expect(apiCreateContact(form)).rejects.toEqual(
			expect.objectContaining<Partial<ContactsApiError>>({
				name: 'ContactsApiError',
				message: 'Invalid email address',
				status: 400
			})
		);
	});

	it('accepts a 207 import response so the UI can report partial failures', async () => {
		const payload = {
			success: false,
			imported: 1,
			failed: 1,
			created: [{ index: 0, contact: { id: 'contact-1' } }],
			failures: [{ index: 1, error: 'Rejected' }]
		};
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify(payload), {
				status: 207,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		vi.stubGlobal('fetch', fetchMock);

		await expect(apiImportContacts([form])).resolves.toEqual(payload);
		expect(fetchMock).toHaveBeenCalledWith('/api/contacts', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
			body: JSON.stringify({ action: 'import', contacts: [form] })
		});
	});
});

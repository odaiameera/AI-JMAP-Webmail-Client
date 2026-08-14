import { describe, expect, it, vi } from 'vitest';
import {
	CONTACTS_CAPABILITY,
	ContactsUnsupportedError,
	ContactSetError,
	createContact,
	createContacts,
	deleteContact,
	getAddressBooks,
	getContacts,
	queryAllContacts,
	queryContacts,
	resolveContactsAccount,
	updateContact
} from './contacts';
import type { JMAPClient } from './client';
import type { JMAPSession } from './types';

function session(overrides: Partial<JMAPSession> = {}): JMAPSession {
	return {
		apiUrl: 'https://mail.example.test/jmap/',
		downloadUrl: '',
		uploadUrl: '',
		eventSourceUrl: '',
		primaryAccounts: { [CONTACTS_CAPABILITY]: 'contacts-account' },
		accounts: {
			'contacts-account': {
				name: 'Example',
				isPersonal: true,
				isReadOnly: false,
				accountCapabilities: {
					[CONTACTS_CAPABILITY]: {
						maxAddressBooksPerCard: null,
						mayCreateAddressBook: true
					}
				}
			}
		},
		capabilities: { [CONTACTS_CAPABILITY]: {} },
		state: 'state-1',
		...overrides
	};
}

describe('resolveContactsAccount', () => {
	it('returns the primary Contacts account only when the session and account advertise the capability', () => {
		expect(resolveContactsAccount(session())).toEqual({
			accountId: 'contacts-account',
			capabilities: {
				maxAddressBooksPerCard: null,
				mayCreateAddressBook: true
			}
		});
	});

	it('reports an unsupported server without affecting mail when the global capability is absent', () => {
		expect(() =>
			resolveContactsAccount(session({ capabilities: {} }))
		).toThrow(ContactsUnsupportedError);
	});

	it('rejects a primary account that does not advertise account-level Contacts support', () => {
		const value = session();
		value.accounts['contacts-account'].accountCapabilities = {};
		expect(() => resolveContactsAccount(value)).toThrow(ContactsUnsupportedError);
	});
});

describe('getAddressBooks', () => {
	it('lists all address books with the Contacts capability', async () => {
		const books = [
			{
				id: 'book-1',
				name: 'Contacts',
				description: null,
				sortOrder: 0,
				isDefault: true,
				isSubscribed: true
			}
		];
		const request = vi.fn().mockResolvedValue({
			methodResponses: [['AddressBook/get', { list: books }, 'g']],
			sessionState: 'session-1'
		});
		const client = { request } as unknown as JMAPClient;

		await expect(getAddressBooks(client, 'contacts-account')).resolves.toEqual(books);
		expect(request).toHaveBeenCalledWith(
			[['AddressBook/get', { accountId: 'contacts-account', ids: null }, 'g']],
			['urn:ietf:params:jmap:core', CONTACTS_CAPABILITY]
		);
	});
});

describe('getContacts', () => {
	it('fetches selected contacts by id', async () => {
		const contacts = [{ id: 'contact-1' }];
		const request = vi.fn().mockResolvedValue({
			methodResponses: [['ContactCard/get', { list: contacts }, 'g']],
			sessionState: 'session-1'
		});
		const client = { request } as unknown as JMAPClient;

		await expect(getContacts(client, 'contacts-account', ['contact-1'])).resolves.toEqual(contacts);
		expect(request).toHaveBeenCalledWith(
			[['ContactCard/get', { accountId: 'contacts-account', ids: ['contact-1'] }, 'g']],
			['urn:ietf:params:jmap:core', CONTACTS_CAPABILITY]
		);
	});
});

describe('queryContacts', () => {
	it('queries by text and fetches the flattened RFC 9610 ContactCard objects by result reference', async () => {
		const contact = {
			id: 'contact-1',
			addressBookIds: { 'book-1': true },
			'@type': 'Card' as const,
			version: '1.0',
			uid: 'urn:uuid:contact-1',
			name: { full: 'Ada Lovelace' },
			emails: { main: { address: 'ada@example.test' } }
		};
		const request = vi.fn().mockResolvedValue({
			methodResponses: [
				['ContactCard/query', { queryState: 'query-1', total: 1, ids: ['contact-1'] }, 'q'],
				['ContactCard/get', { list: [contact] }, 'g']
			],
			sessionState: 'session-1'
		});
		const client = { request } as unknown as JMAPClient;

		await expect(queryContacts(client, 'contacts-account', '  ada  ', 8, 2)).resolves.toEqual({
			contacts: [contact],
			queryState: 'query-1',
			total: 1
		});
		expect(request).toHaveBeenCalledWith(
			[
				[
					'ContactCard/query',
					{
						accountId: 'contacts-account',
						filter: { text: 'ada' },
						position: 2,
						limit: 8,
						calculateTotal: true
					},
					'q'
				],
				[
					'ContactCard/get',
					{
						accountId: 'contacts-account',
						'#ids': { resultOf: 'q', name: 'ContactCard/query', path: '/ids' }
					},
					'g'
				]
			],
			['urn:ietf:params:jmap:core', CONTACTS_CAPABILITY]
		);
	});

	it('loads every query page for complete-inventory consumers', async () => {
		const firstPage = Array.from({ length: 100 }, (_, index) => ({
			id: `contact-${index}`,
			addressBookIds: { 'book-1': true },
			'@type': 'Card' as const,
			version: '1.0' as const,
			uid: `urn:uuid:${index}`
		}));
		const last = {
			id: 'contact-100',
			addressBookIds: { 'book-1': true },
			'@type': 'Card' as const,
			version: '1.0' as const,
			uid: 'urn:uuid:100'
		};
		const request = vi.fn()
			.mockResolvedValueOnce({
				methodResponses: [
					['ContactCard/query', { queryState: 'query-1', total: 101 }, 'q'],
					['ContactCard/get', { list: firstPage }, 'g']
				],
				sessionState: 'session-1'
			})
			.mockResolvedValueOnce({
				methodResponses: [
					['ContactCard/query', { queryState: 'query-1', total: 101 }, 'q'],
					['ContactCard/get', { list: [last] }, 'g']
				],
				sessionState: 'session-1'
			});
		const client = { request } as unknown as JMAPClient;

		await expect(queryAllContacts(client, 'contacts-account')).resolves.toEqual([...firstPage, last]);
		expect(request).toHaveBeenNthCalledWith(
			2,
			expect.arrayContaining([
				['ContactCard/query', expect.objectContaining({ position: 100, limit: 100 }), 'q']
			]),
			['urn:ietf:params:jmap:core', CONTACTS_CAPABILITY]
		);
	});
});

describe('updateContact', () => {
	it('rejects a ContactCard/set response with the wrong invocation id', async () => {
		const request = vi.fn().mockResolvedValue({
			methodResponses: [['ContactCard/set', { updated: { 'contact-1': null } }, 'wrong']],
			sessionState: 'session-1'
		});
		const client = { request } as unknown as JMAPClient;

		await expect(updateContact(client, 'contacts-account', 'contact-1', {}))
			.rejects.toThrow('unexpected invocation id');
	});

	it('sends an RFC 8620 patch object and verifies partial failures', async () => {
		const request = vi.fn().mockResolvedValue({
			methodResponses: [['ContactCard/set', { updated: { 'contact-1': null } }, 's']],
			sessionState: 'session-1'
		});
		const client = { request } as unknown as JMAPClient;
		const patch = { 'name/full': 'Ada Byron' };

		await expect(updateContact(client, 'contacts-account', 'contact-1', patch)).resolves.toBeUndefined();
		expect(request).toHaveBeenCalledWith(
			[['ContactCard/set', { accountId: 'contacts-account', update: { 'contact-1': patch } }, 's']],
			['urn:ietf:params:jmap:core', CONTACTS_CAPABILITY]
		);
	});
});

describe('deleteContact', () => {
	it('rejects a method-level JMAP error instead of reporting a successful delete', async () => {
		const request = vi.fn().mockResolvedValue({
			methodResponses: [['error', { type: 'serverFail', description: 'internal detail' }, 's']],
			sessionState: 'session-1'
		});
		const client = { request } as unknown as JMAPClient;

		await expect(deleteContact(client, 'contacts-account', 'contact-1'))
			.rejects.toThrow('ContactCard/set returned a method-level error');
	});

	it('destroys the requested contact and verifies partial failures', async () => {
		const request = vi.fn().mockResolvedValue({
			methodResponses: [['ContactCard/set', { destroyed: ['contact-1'] }, 's']],
			sessionState: 'session-1'
		});
		const client = { request } as unknown as JMAPClient;

		await expect(deleteContact(client, 'contacts-account', 'contact-1')).resolves.toBeUndefined();
		expect(request).toHaveBeenCalledWith(
			[['ContactCard/set', { accountId: 'contacts-account', destroy: ['contact-1'] }, 's']],
			['urn:ietf:params:jmap:core', CONTACTS_CAPABILITY]
		);
	});
});

describe('createContact', () => {
	it('sends the JSContact properties directly alongside addressBookIds', async () => {
		const created = {
			id: 'contact-1',
			addressBookIds: { 'book-1': true },
			'@type': 'Card' as const,
			version: '1.0' as const,
			uid: 'urn:uuid:contact-1',
			name: { full: 'Ada Lovelace' }
		};
		const request = vi.fn()
			.mockResolvedValueOnce({
				methodResponses: [['ContactCard/set', { created: { contact: created } }, 's']],
				sessionState: 'session-1'
			})
			.mockResolvedValueOnce({
				methodResponses: [['ContactCard/get', { list: [created] }, 'g']],
				sessionState: 'session-1'
			});
		const client = { request } as unknown as JMAPClient;
		const create = {
			addressBookIds: { 'book-1': true },
			'@type': 'Card' as const,
			version: '1.0' as const,
			uid: 'urn:uuid:contact-1',
			name: { full: 'Ada Lovelace' }
		};

		await expect(createContact(client, 'contacts-account', create)).resolves.toEqual(created);
		expect(request).toHaveBeenCalledWith(
			[
				[
					'ContactCard/set',
					{ accountId: 'contacts-account', create: { contact: create } },
					's'
				]
			],
			['urn:ietf:params:jmap:core', CONTACTS_CAPABILITY]
		);
	});

	it('hydrates a newly created card when the SetResponse only returns its id', async () => {
		const created = {
			id: 'contact-1',
			addressBookIds: { 'book-1': true },
			'@type': 'Card' as const,
			version: '1.0' as const,
			uid: 'urn:uuid:contact-1',
			name: { full: 'Ada Lovelace' }
		};
		const request = vi.fn()
			.mockResolvedValueOnce({
				methodResponses: [['ContactCard/set', { created: { contact: { id: 'contact-1' } } }, 's']],
				sessionState: 'session-1'
			})
			.mockResolvedValueOnce({
				methodResponses: [['ContactCard/get', { list: [created] }, 'g']],
				sessionState: 'session-1'
			});
		const client = { request } as unknown as JMAPClient;
		const create = {
			addressBookIds: { 'book-1': true },
			'@type': 'Card' as const,
			version: '1.0' as const,
			uid: 'urn:uuid:contact-1',
			name: { full: 'Ada Lovelace' }
		};

		await expect(createContact(client, 'contacts-account', create)).resolves.toEqual(created);
		expect(request).toHaveBeenNthCalledWith(
			2,
			[['ContactCard/get', { accountId: 'contacts-account', ids: ['contact-1'] }, 'g']],
			['urn:ietf:params:jmap:core', CONTACTS_CAPABILITY]
		);
	});

	it('hydrates a structurally valid but incomplete created card before returning it', async () => {
		const sparse = {
			id: 'contact-1',
			addressBookIds: { 'book-1': true },
			'@type': 'Card' as const,
			version: '1.0' as const,
			uid: 'urn:uuid:contact-1'
		};
		const hydrated = {
			...sparse,
			name: { full: 'Ada Lovelace' },
			emails: { main: { address: 'ada@example.test' } }
		};
		const request = vi.fn()
			.mockResolvedValueOnce({
				methodResponses: [['ContactCard/set', { created: { contact: sparse } }, 's']],
				sessionState: 'session-1'
			})
			.mockResolvedValueOnce({
				methodResponses: [['ContactCard/get', { list: [hydrated] }, 'g']],
				sessionState: 'session-1'
			});
		const client = { request } as unknown as JMAPClient;
		const create = {
			addressBookIds: { 'book-1': true },
			'@type': 'Card' as const,
			version: '1.0' as const,
			uid: 'urn:uuid:contact-1',
			name: { full: 'Ada Lovelace' },
			emails: { main: { address: 'ada@example.test' } }
		};

		await expect(createContact(client, 'contacts-account', create)).resolves.toEqual(hydrated);
		expect(request).toHaveBeenCalledTimes(2);
	});

	it('preserves partial ContactCard/set failure details', async () => {
		const failure = {
			type: 'invalidProperties',
			description: 'uid is required',
			properties: ['uid']
		};
		const request = vi.fn().mockResolvedValue({
			methodResponses: [['ContactCard/set', { notCreated: { contact: failure } }, 's']],
			sessionState: 'session-1'
		});
		const client = { request } as unknown as JMAPClient;
		const create = {
			addressBookIds: { 'book-1': true },
			'@type': 'Card' as const,
			version: '1.0' as const,
			uid: 'urn:uuid:contact-1'
		};

		const error = await createContact(client, 'contacts-account', create).catch(
			(value: unknown) => value as ContactSetError
		);
		expect(error).toBeInstanceOf(ContactSetError);
		expect(error.failures).toEqual([
			{ operation: 'create', id: 'contact', ...failure }
		]);
		expect(error.message).toBe('Contact create rejected: uid is required (uid)');
	});
});

describe('createContacts', () => {
	it('rejects a method-level JMAP error instead of reporting an empty successful batch', async () => {
		const request = vi.fn().mockResolvedValue({
			methodResponses: [['error', { type: 'serverFail', description: 'internal detail' }, 's']],
			sessionState: 'session-1'
		});
		const client = { request } as unknown as JMAPClient;
		const create = {
			addressBookIds: { 'book-1': true },
			'@type': 'Card' as const,
			version: '1.0' as const,
			uid: 'urn:uuid:contact'
		};

		await expect(createContacts(client, 'contacts-account', [create]))
			.rejects.toThrow('ContactCard/set returned a method-level error');
	});

	it('uses one bounded ContactCard/set call and returns per-row partial failures', async () => {
		const first = {
			addressBookIds: { 'book-1': true },
			'@type': 'Card' as const,
			version: '1.0' as const,
			uid: 'urn:uuid:first',
			name: { full: 'First' }
		};
		const second = { ...first, uid: 'urn:uuid:second', name: { full: 'Second' } };
		const created = { ...first, id: 'contact-1' };
		const failure = { type: 'invalidProperties', description: 'rejected', properties: ['name'] };
		const request = vi.fn().mockResolvedValue({
			methodResponses: [[
				'ContactCard/set',
				{ created: { import0: created }, notCreated: { import1: failure } },
				's'
			]],
			sessionState: 'session-1'
		});
		const client = { request } as unknown as JMAPClient;

		await expect(createContacts(client, 'contacts-account', [first, second])).resolves.toEqual({
			created: [{ creationId: 'import0', contact: created }],
			failures: [{ operation: 'create', id: 'import1', ...failure }]
		});
		expect(request).toHaveBeenCalledWith(
			[['ContactCard/set', {
				accountId: 'contacts-account',
				create: { import0: first, import1: second }
			}, 's']],
			['urn:ietf:params:jmap:core', CONTACTS_CAPABILITY]
		);
	});

	it('rejects more than 50 contacts before calling JMAP', async () => {
		const request = vi.fn();
		const client = { request } as unknown as JMAPClient;
		const create = {
			addressBookIds: { 'book-1': true },
			'@type': 'Card' as const,
			version: '1.0' as const,
			uid: 'urn:uuid:contact'
		};
		await expect(createContacts(client, 'contacts-account', Array(51).fill(create))).rejects.toThrow(/50/);
		expect(request).not.toHaveBeenCalled();
	});
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { ContactCard } from '$lib/jmap/types';
import { queueSenderForContacts } from '$lib/contacts/navigation';

const mocks = vi.hoisted(() => ({
	apiLoadContacts: vi.fn(),
	apiCreateContact: vi.fn(),
	apiUpdateContact: vi.fn(),
	apiDeleteContact: vi.fn(),
	apiImportContacts: vi.fn()
}));

vi.mock('$lib/contacts/api', () => ({
	...mocks,
	ContactsApiError: class ContactsApiError extends Error {}
}));

import ContactsApp from './ContactsApp.svelte';

const writableBook = {
	id: 'book-1',
	name: 'Personal',
	description: null,
	sortOrder: 0,
	isDefault: true,
	isSubscribed: true,
	myRights: { mayRead: true, mayWrite: true, mayShare: false, mayDelete: false }
};

const ada: ContactCard = {
	id: 'contact-1',
	'@type': 'Card',
	version: '1.0',
	uid: 'urn:uuid:ada',
	name: { full: 'Ada Lovelace' },
	emails: {
		primary: { address: 'ada@example.test', contexts: { work: true }, pref: 1 },
		secondary: { address: 'ada.home@example.test', contexts: { private: true } }
	},
	phones: { mobile: { number: '+353 87 555 0100', contexts: { private: true }, pref: 1 } },
	organizations: { org1: { name: 'Analytical Engine' } },
	addressBookIds: { 'book-1': true }
};

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	window.history.replaceState({}, '', '/');
});

describe('ContactsApp', () => {
	it('loads contacts and exposes the selected contact actions', async () => {
		mocks.apiLoadContacts.mockResolvedValue({
			supported: true,
			capabilities: {},
			addressBooks: [writableBook],
			contacts: [ada],
			queryState: 'state-1',
			total: 1
		});

		render(ContactsApp);

		expect(screen.getByRole('status').textContent).toContain('Loading contacts');
		await waitFor(() => expect(screen.getAllByText('Ada Lovelace').length).toBeGreaterThan(0));
		expect(screen.getAllByText('ada@example.test').length).toBeGreaterThan(0);
		expect(screen.getByRole('button', { name: 'New contact' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Import contacts' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Compose email' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Edit contact' })).toBeTruthy();
	});

	it('renders a useful capability fallback rather than a broken empty app', async () => {
		mocks.apiLoadContacts.mockResolvedValue({
			supported: false,
			capabilities: null,
			addressBooks: [],
			contacts: [],
			queryState: '',
			total: 0
		});

		render(ContactsApp);

		await waitFor(() => expect(screen.getByText('Contacts are not available')).toBeTruthy());
		expect(screen.getByText(/does not advertise JMAP Contacts/i)).toBeTruthy();
		expect((screen.getByRole('button', { name: 'Import contacts' }) as HTMLButtonElement).disabled).toBe(true);
		expect((screen.getByRole('button', { name: 'New contact' }) as HTMLButtonElement).disabled).toBe(true);
	});

	it('disables create and import when every address book is read-only', async () => {
		mocks.apiLoadContacts.mockResolvedValue({
			supported: true,
			capabilities: { maxAddressBooksPerCard: 1 },
			addressBooks: [{
				...writableBook,
				id: 'book-2',
				name: 'Directory',
				myRights: { ...writableBook.myRights, mayWrite: false }
			}],
			contacts: [],
			queryState: 'state-1',
			total: 0
		});

		render(ContactsApp);
		await waitFor(() => expect(screen.getByText('No contacts yet')).toBeTruthy());

		expect((screen.getByRole('button', { name: 'Import contacts' }) as HTMLButtonElement).disabled).toBe(true);
		expect((screen.getByRole('button', { name: 'New contact' }) as HTMLButtonElement).disabled).toBe(true);
	});

	it('does not allow a read-only address book to be selected in the contact form', async () => {
		mocks.apiLoadContacts.mockResolvedValue({
			supported: true,
			capabilities: { maxAddressBooksPerCard: 1 },
			addressBooks: [
				writableBook,
				{
					...writableBook,
					id: 'book-2',
					name: 'Directory',
					isDefault: false,
					myRights: { ...writableBook.myRights, mayWrite: false }
				}
			],
			contacts: [],
			queryState: 'state-1',
			total: 0
		});

		render(ContactsApp);
		await waitFor(() => expect(screen.getByText('No contacts yet')).toBeTruthy());
		await fireEvent.click(screen.getByRole('button', { name: 'New contact' }));

		expect((screen.getByRole('checkbox', { name: 'Personal (default)' }) as HTMLInputElement).disabled).toBe(false);
		expect((screen.getByRole('checkbox', { name: 'Directory' }) as HTMLInputElement).disabled).toBe(true);
	});

	it('disables edit and delete for a contact in a read-only address book', async () => {
		mocks.apiLoadContacts.mockResolvedValue({
			supported: true,
			capabilities: {},
			addressBooks: [
				writableBook,
				{
					...writableBook,
					id: 'book-2',
					name: 'Directory',
					myRights: { ...writableBook.myRights, mayWrite: false }
				}
			],
			contacts: [{ ...ada, addressBookIds: { 'book-2': true } }],
			total: 1,
			position: 0
		});

		render(ContactsApp);
		await waitFor(() => expect(screen.getByRole('button', { name: 'Edit contact' })).toBeTruthy());
		expect((screen.getByRole('button', { name: 'Edit contact' }) as HTMLButtonElement).disabled).toBe(true);
		expect((screen.getByRole('button', { name: 'Delete contact' }) as HTMLButtonElement).disabled).toBe(true);
	});

	it('reloads the complete unfiltered inventory before opening import after a search', async () => {
		const grace = { ...ada, id: 'grace', uid: 'urn:uuid:grace', name: { full: 'Grace Hopper' } };
		const response = (contacts: ContactCard[]) => ({
			supported: true as const,
			capabilities: {},
			addressBooks: [writableBook],
			contacts,
			total: contacts.length,
			position: 0
		});
		mocks.apiLoadContacts
			.mockResolvedValueOnce(response([ada, grace]))
			.mockResolvedValueOnce(response([grace]))
			.mockResolvedValueOnce(response([ada, grace]));

		render(ContactsApp);
		await waitFor(() => expect(mocks.apiLoadContacts).toHaveBeenCalledTimes(1));
		const search = screen.getByLabelText('Search contacts');
		await fireEvent.input(search, { target: { value: 'Grace' } });
		await fireEvent.submit(search.closest('form')!);
		await waitFor(() => expect(mocks.apiLoadContacts).toHaveBeenCalledTimes(2));
		await fireEvent.click(screen.getByRole('button', { name: 'Import contacts' }));

		await waitFor(() => expect(mocks.apiLoadContacts).toHaveBeenCalledTimes(3));
		expect(mocks.apiLoadContacts.mock.calls[2]?.[0]).toBe('');
		expect(screen.getByRole('dialog', { name: 'Import contacts' })).toBeTruthy();
	});

	it('edits a contact without dropping secondary addresses', async () => {
		mocks.apiLoadContacts.mockResolvedValue({
			supported: true,
			capabilities: {},
			addressBooks: [writableBook],
			contacts: [ada],
			queryState: 'state-1',
			total: 1
		});
		mocks.apiUpdateContact.mockResolvedValue(undefined);

		render(ContactsApp);
		await waitFor(() => expect(screen.getByRole('button', { name: 'Edit contact' })).toBeTruthy());
		await fireEvent.click(screen.getByRole('button', { name: 'Edit contact' }));
		expect(screen.getByRole('dialog', { name: 'Edit contact' })).toBeTruthy();
		expect((screen.getByLabelText('Email address 1') as HTMLInputElement).value).toBe('ada@example.test');
		expect((screen.getByLabelText('Email address 2') as HTMLInputElement).value).toBe('ada.home@example.test');
		await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Ada Byron' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save contact' }));

		await waitFor(() => expect(mocks.apiUpdateContact).toHaveBeenCalled());
		expect(mocks.apiUpdateContact).toHaveBeenCalledWith(
			'contact-1',
			expect.objectContaining({
				name: 'Ada Byron',
				emails: [
					{ id: 'primary', address: 'ada@example.test', type: 'work', pref: 1 },
					{ id: 'secondary', address: 'ada.home@example.test', type: 'home' }
				]
			})
		);
	});

	it('requires confirmation before deleting a contact', async () => {
		mocks.apiLoadContacts.mockResolvedValue({
			supported: true,
			capabilities: {},
			addressBooks: [writableBook],
			contacts: [ada],
			queryState: 'state-1',
			total: 1
		});
		mocks.apiDeleteContact.mockResolvedValue(undefined);

		render(ContactsApp);
		await waitFor(() => expect(screen.getByRole('button', { name: 'Delete contact' })).toBeTruthy());
		await fireEvent.click(screen.getByRole('button', { name: 'Delete contact' }));
		expect(screen.getByRole('dialog', { name: 'Delete contact?' })).toBeTruthy();
		expect(mocks.apiDeleteContact).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole('button', { name: 'Confirm delete contact' }));
		await waitFor(() => expect(mocks.apiDeleteContact).toHaveBeenCalledWith('contact-1'));
		await waitFor(() => expect(screen.getByText('No contacts yet')).toBeTruthy());
	});

	it('prefills Add to Contacts from one-shot navigation state without URL PII', async () => {
		window.history.replaceState({}, '', '/contacts');
		queueSenderForContacts({ name: 'Lin Chen', email: 'LIN@Example.test' });
		mocks.apiLoadContacts.mockResolvedValue({
			supported: true,
			capabilities: {},
			addressBooks: [writableBook],
			contacts: [],
			queryState: 'state-1',
			total: 0
		});

		render(ContactsApp);

		await waitFor(() => expect(screen.getByRole('dialog', { name: 'New contact' })).toBeTruthy());
		expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Lin Chen');
		expect((screen.getByLabelText('Email address 1') as HTMLInputElement).value).toBe('LIN@Example.test');
		expect(window.location.search).toBe('');
	});

	it('creates a contact through the accessible form and selects it', async () => {
		mocks.apiLoadContacts.mockResolvedValue({
			supported: true,
			capabilities: {},
			addressBooks: [writableBook],
			contacts: [],
			queryState: 'state-1',
			total: 0
		});
		const grace: ContactCard = {
			...ada,
			id: 'contact-2',
			uid: 'urn:uuid:grace',
			name: { full: 'Grace Hopper' },
			emails: { email1: { address: 'grace@example.test', pref: 1 } }
		};
		mocks.apiCreateContact.mockResolvedValue(grace);

		render(ContactsApp);
		await waitFor(() => expect(screen.getByText('No contacts yet')).toBeTruthy());
		await fireEvent.click(screen.getByRole('button', { name: 'New contact' }));
		expect(screen.getByRole('dialog', { name: 'New contact' })).toBeTruthy();
		await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Grace Hopper' } });
		await fireEvent.input(screen.getByLabelText('Email address 1'), {
			target: { value: 'grace@example.test' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Save contact' }));

		await waitFor(() => expect(mocks.apiCreateContact).toHaveBeenCalled());
		expect(mocks.apiCreateContact).toHaveBeenCalledWith(
			expect.objectContaining({
				name: 'Grace Hopper',
				emails: [{ address: 'grace@example.test', type: 'other' }],
				addressBookIds: ['book-1']
			})
		);
		await waitFor(() => expect(screen.getAllByText('Grace Hopper').length).toBeGreaterThan(0));
	});
});

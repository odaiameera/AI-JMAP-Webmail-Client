// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { ContactCard } from '$lib/jmap/types';

const mocks = vi.hoisted(() => ({ apiImportContacts: vi.fn() }));
vi.mock('$lib/contacts/api', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/contacts/api')>()),
	apiImportContacts: mocks.apiImportContacts
}));

import ImportContactsModal from './ImportContactsModal.svelte';

const writableBook = {
	id: 'book-1',
	name: 'Personal',
	description: null,
	sortOrder: 0,
	isDefault: true,
	isSubscribed: true,
	myRights: { mayRead: true, mayWrite: true, mayShare: false, mayDelete: false }
};

const existing: ContactCard = {
	id: 'existing',
	'@type': 'Card',
	version: '1.0',
	uid: 'urn:uuid:existing',
	name: { full: 'Ada Existing' },
	emails: { email1: { address: 'ada@example.test' } },
	addressBookIds: { 'book-1': true }
};

const vcard = [
	'BEGIN:VCARD',
	'VERSION:3.0',
	'FN:Ada Duplicate',
	'EMAIL:ada@example.test',
	'END:VCARD',
	'BEGIN:VCARD',
	'VERSION:3.0',
	'FN:Grace Hopper',
	'EMAIL:grace@example.test',
	'END:VCARD'
].join('\r\n');

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('ImportContactsModal', () => {
	it('previews Apple/Google exports, excludes duplicates, and reports the imported batch', async () => {
		const onImported = vi.fn();
		mocks.apiImportContacts.mockResolvedValue({
			success: true,
			imported: 1,
			failed: 0,
			created: [{ index: 0, contact: { ...existing, id: 'grace' } }],
			failures: []
		});
		render(ImportContactsModal, {
			props: {
				open: true,
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
				existingContacts: [existing],
				onClose: vi.fn(),
				onImported
			}
		});
		expect((screen.getByRole('option', { name: 'Directory' }) as HTMLOptionElement).disabled).toBe(true);

		const file = new File([vcard], 'Apple Contacts.vcf', { type: 'text/vcard' });
		await fireEvent.change(screen.getByLabelText('Choose contacts file'), {
			target: { files: [file] }
		});

		await waitFor(() => expect(screen.getByText('1 ready')).toBeTruthy());
		expect(screen.getByText('1 duplicate')).toBeTruthy();
		expect(screen.getByText('Grace Hopper')).toBeTruthy();
		expect(screen.getByText('Ada Duplicate')).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Import 1 contact' }));

		await waitFor(() => expect(mocks.apiImportContacts).toHaveBeenCalled());
		expect(mocks.apiImportContacts).toHaveBeenCalledWith([
			expect.objectContaining({
				name: 'Grace Hopper',
				emails: [{ address: 'grace@example.test', type: 'other' }],
				addressBookIds: ['book-1']
			})
		]);
		await waitFor(() => expect(screen.getByText('Imported 1 contact')).toBeTruthy());
		expect(onImported).toHaveBeenCalledWith({ imported: 1, failed: 0 });
	});

	it('splits large valid imports by encoded request size before calling the API', async () => {
		const cards = Array.from({ length: 41 }, (_, index) => [
			'BEGIN:VCARD',
			'VERSION:4.0',
			`FN:Contact ${index}`,
			`EMAIL:contact${index}@example.test`,
			`NOTE:${'x'.repeat(10_000)}`,
			'END:VCARD'
		].join('\r\n')).join('\r\n');
		mocks.apiImportContacts.mockImplementation(async (contacts: unknown[]) => ({
			success: true,
			imported: contacts.length,
			failed: 0,
			created: [],
			failures: []
		}));

		render(ImportContactsModal, {
			props: {
				open: true,
				addressBooks: [writableBook],
				existingContacts: [],
				onClose: vi.fn(),
				onImported: vi.fn()
			}
		});
		const file = new File([cards], 'contacts.vcf', { type: 'text/vcard' });
		await fireEvent.change(screen.getByLabelText('Choose contacts file'), { target: { files: [file] } });
		await screen.findByText('41 ready');
		await fireEvent.click(screen.getByRole('button', { name: 'Import 41 contacts' }));

		await waitFor(() => expect(mocks.apiImportContacts).toHaveBeenCalledTimes(2));
		expect(mocks.apiImportContacts.mock.calls.flatMap(([batch]) => batch)).toHaveLength(41);
	});
});

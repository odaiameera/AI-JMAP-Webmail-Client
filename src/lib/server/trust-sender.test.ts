import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ queryContacts: vi.fn(), resolveContactsAccount: vi.fn() }));

vi.mock('$lib/jmap/contacts', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/jmap/contacts')>()),
	queryContacts: mocks.queryContacts,
	resolveContactsAccount: mocks.resolveContactsAccount
}));

import { ContactsUnsupportedError } from '$lib/jmap/contacts';
import { senderInContacts } from './trust-sender';

const client = {} as never;
const session = {} as never;

beforeEach(() => {
	mocks.queryContacts.mockReset();
	mocks.resolveContactsAccount.mockReset().mockReturnValue({ accountId: 'C1' });
});

describe('senderInContacts', () => {
	it('matches the exact address, not a substring near-miss', async () => {
		mocks.queryContacts.mockResolvedValue({
			contacts: [{ emails: { e1: { address: 'farah@example.test.evil' } } }, { emails: { e1: { address: 'Farah@Example.test' } } }]
		});
		expect(await senderInContacts(client, session, '"Farah" <farah@example.test>')).toBe(true);
		expect(mocks.queryContacts).toHaveBeenCalledWith(client, 'C1', 'farah@example.test', 20);
	});

	it('says no for an address only a near-miss card mentions', async () => {
		mocks.queryContacts.mockResolvedValue({
			contacts: [{ emails: { e1: { address: 'farah@example.test.evil' } } }]
		});
		expect(await senderInContacts(client, session, 'farah@example.test')).toBe(false);
	});

	it('says unknown when the server has no contacts', async () => {
		mocks.resolveContactsAccount.mockImplementation(() => {
			throw new ContactsUnsupportedError();
		});
		expect(await senderInContacts(client, session, 'farah@example.test')).toBeNull();
		expect(await senderInContacts(client, session, 'nonsense')).toBeNull();
	});
});

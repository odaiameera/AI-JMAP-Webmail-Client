import { JMAPError, type JMAPClient } from './client';
import type { AddressBook, ContactCard, ContactCardCreate, JMAPResponse, JMAPSession } from './types';

export const CONTACTS_CAPABILITY = 'urn:ietf:params:jmap:contacts';

export interface ContactsAccountCapabilities {
	maxAddressBooksPerCard: number | null;
	mayCreateAddressBook: boolean;
	[key: string]: unknown;
}

export interface ContactsAccount {
	accountId: string;
	capabilities: ContactsAccountCapabilities;
}

export class ContactsUnsupportedError extends Error {
	constructor(message = 'JMAP Contacts is not available for this account') {
		super(message);
		this.name = 'ContactsUnsupportedError';
	}
}

export function resolveContactsAccount(session: JMAPSession): ContactsAccount {
	if (!(CONTACTS_CAPABILITY in session.capabilities)) {
		throw new ContactsUnsupportedError();
	}

	const accountId = session.primaryAccounts[CONTACTS_CAPABILITY];
	const capabilities = accountId
		? session.accounts[accountId]?.accountCapabilities?.[CONTACTS_CAPABILITY]
		: undefined;

	if (!accountId || !capabilities || typeof capabilities !== 'object') {
		throw new ContactsUnsupportedError();
	}

	return {
		accountId,
		capabilities: capabilities as ContactsAccountCapabilities
	};
}

const CONTACTS_USING = ['urn:ietf:params:jmap:core', CONTACTS_CAPABILITY];

export async function getAddressBooks(
	client: JMAPClient,
	accountId: string
): Promise<AddressBook[]> {
	const response = await client.request(
		[['AddressBook/get', { accountId, ids: null }, 'g']],
		CONTACTS_USING
	);
	const result = response.methodResponses[0][1] as { list?: AddressBook[] };
	return result.list ?? [];
}

export async function getContacts(
	client: JMAPClient,
	accountId: string,
	ids: string[] | null
): Promise<ContactCard[]> {
	const response = await client.request(
		[['ContactCard/get', { accountId, ids }, 'g']],
		CONTACTS_USING
	);
	const result = response.methodResponses[0][1] as { list?: ContactCard[] };
	return result.list ?? [];
}

export interface ContactQueryResult {
	contacts: ContactCard[];
	queryState: string;
	total: number;
}

export async function queryContacts(
	client: JMAPClient,
	accountId: string,
	query = '',
	limit = 100,
	position = 0
): Promise<ContactQueryResult> {
	const text = query.trim();
	const response = await client.request(
		[
			[
				'ContactCard/query',
				{
					accountId,
					filter: text ? { text } : undefined,
					position,
					limit,
					calculateTotal: true
				},
				'q'
			],
			[
				'ContactCard/get',
				{
					accountId,
					'#ids': { resultOf: 'q', name: 'ContactCard/query', path: '/ids' }
				},
				'g'
			]
		],
		CONTACTS_USING
	);
	const queryResult = response.methodResponses[0][1] as {
		queryState?: string;
		total?: number;
	};
	const getResult = response.methodResponses[1][1] as { list?: ContactCard[] };
	return {
		contacts: getResult.list ?? [],
		queryState: queryResult.queryState ?? '',
		total: queryResult.total ?? 0
	};
}

export async function queryAllContacts(
	client: JMAPClient,
	accountId: string,
	query = '',
	pageSize = 100
): Promise<ContactCard[]> {
	const contacts = new Map<string, ContactCard>();
	let position = 0;
	let total: number | null = null;

	do {
		const page = await queryContacts(client, accountId, query, pageSize, position);
		for (const contact of page.contacts) contacts.set(contact.id, contact);
		total = page.total;
		if (page.contacts.length === 0) break;
		position += page.contacts.length;
	} while (position < total);

	return [...contacts.values()];
}

export interface ContactSetFailure {
	operation: 'create' | 'update' | 'destroy';
	id: string;
	type: string;
	description: string;
	properties?: string[];
}

export class ContactSetError extends JMAPError {
	constructor(
		message: string,
		public failures: ContactSetFailure[]
	) {
		super(message);
		this.name = 'ContactSetError';
	}
}

interface SetErrorValue {
	type?: string;
	description?: string;
	properties?: string[];
}

interface ContactSetResult {
	created?: Record<string, ContactCard>;
	notCreated?: Record<string, SetErrorValue>;
	notUpdated?: Record<string, SetErrorValue>;
	notDestroyed?: Record<string, SetErrorValue>;
}

function contactSetResult(response: JMAPResponse, callId = 's'): ContactSetResult {
	const methodResponse = response.methodResponses[0];
	if (!methodResponse || methodResponse[2] !== callId) {
		throw new JMAPError('ContactCard/set returned an unexpected invocation id');
	}
	if (methodResponse[0] === 'error' || methodResponse[0].endsWith('/error')) {
		throw new JMAPError('ContactCard/set returned a method-level error');
	}
	if (methodResponse[0] !== 'ContactCard/set') {
		throw new JMAPError('ContactCard/set returned an unexpected method response');
	}
	return methodResponse[1] as ContactSetResult;
}

function collectSetFailures(result: ContactSetResult): ContactSetFailure[] {
	const failures: ContactSetFailure[] = [];
	for (const [operation, values] of [
		['create', result.notCreated],
		['update', result.notUpdated],
		['destroy', result.notDestroyed]
	] as const) {
		for (const [id, failure] of Object.entries(values ?? {})) {
			failures.push({
				operation,
				id,
				type: failure.type ?? 'serverFail',
				description: failure.description ?? 'rejected by server',
				properties: failure.properties
			});
		}
	}
	return failures;
}

function throwSetFailures(result: ContactSetResult): void {
	const failures = collectSetFailures(result);
	if (failures.length === 0) return;
	const first = failures[0];
	const properties = first.properties?.length ? ` (${first.properties.join(', ')})` : '';
	throw new ContactSetError(
		`Contact ${first.operation} rejected: ${first.description}${properties}`,
		failures
	);
}

export async function updateContact(
	client: JMAPClient,
	accountId: string,
	id: string,
	patch: Record<string, unknown>
): Promise<void> {
	const response = await client.request(
		[['ContactCard/set', { accountId, update: { [id]: patch } }, 's']],
		CONTACTS_USING
	);
	throwSetFailures(contactSetResult(response));
}

export async function deleteContact(
	client: JMAPClient,
	accountId: string,
	id: string
): Promise<void> {
	const response = await client.request(
		[['ContactCard/set', { accountId, destroy: [id] }, 's']],
		CONTACTS_USING
	);
	throwSetFailures(contactSetResult(response));
}

export async function createContact(
	client: JMAPClient,
	accountId: string,
	contact: ContactCardCreate
): Promise<ContactCard> {
	const response = await client.request(
		[['ContactCard/set', { accountId, create: { contact } }, 's']],
		CONTACTS_USING
	);
	const result = contactSetResult(response);
	throwSetFailures(result);
	const created = result.created?.contact;
	if (!created?.id) throw new JMAPError('ContactCard/set did not return the created contact id');
	const [hydrated] = await getContacts(client, accountId, [created.id]);
	if (!hydrated) throw new JMAPError('ContactCard/get did not return the newly created contact');
	return hydrated;
}

export interface ContactBatchCreateResult {
	created: Array<{ creationId: string; contact: ContactCard }>;
	failures: ContactSetFailure[];
}

export async function createContacts(
	client: JMAPClient,
	accountId: string,
	contacts: ContactCardCreate[]
): Promise<ContactBatchCreateResult> {
	if (contacts.length === 0) return { created: [], failures: [] };
	if (contacts.length > 50) throw new JMAPError('A contact import batch cannot exceed 50 contacts');
	const create = Object.fromEntries(
		contacts.map((contact, index) => [`import${index}`, contact])
	);
	const response = await client.request(
		[['ContactCard/set', { accountId, create }, 's']],
		CONTACTS_USING
	);
	const result = contactSetResult(response);
	return {
		created: Object.entries(result.created ?? {}).map(([creationId, contact]) => ({
			creationId,
			contact
		})),
		failures: collectSetFailures(result)
	};
}

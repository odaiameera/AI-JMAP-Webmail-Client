import { json as kitJson } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient, fetchSession } from '$lib/jmap/auth';
import {
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
} from '$lib/jmap/contacts';
import { JMAPAuthError, JMAPError } from '$lib/jmap/client';
import {
	ContactValidationError,
	contactCreateFromInput,
	contactPatchFromInput,
	validateAddressBookSelection,
	type ContactFormInput
} from '$lib/server/contacts';

function integerParam(value: string | null, fallback: number, min: number, max: number): number {
	if (value === null || !/^\d+$/.test(value)) return fallback;
	return Math.min(max, Math.max(min, Number(value)));
}

function json(data: unknown, init: ResponseInit = {}): Response {
	const headers = new Headers(init.headers);
	headers.set('Cache-Control', 'private, no-store');
	return kitJson(data, { ...init, headers });
}

function safeSetFailureDescription(type: string): string {
	switch (type) {
		case 'invalidProperties':
			return 'One or more contact fields were rejected';
		case 'forbidden':
		case 'accountReadOnly':
			return 'You do not have permission to make this contact change';
		case 'overQuota':
			return 'The contacts account quota has been reached';
		case 'tooLarge':
			return 'The contact is too large';
		case 'notFound':
			return 'The contact no longer exists';
		default:
			return 'The contact change was rejected by the server';
	}
}

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.auth) return json({ error: 'Not authenticated' }, { status: 401 });

	try {
		const session = await fetchSession(locals.auth);
		const { accountId, capabilities } = resolveContactsAccount(session);
		const client = createClient(locals.auth);
		const query = (url.searchParams.get('q') ?? '').trim().slice(0, 255);
		const limit = integerParam(url.searchParams.get('limit'), 100, 1, 100);
		const position = integerParam(url.searchParams.get('position'), 0, 0, 1_000_000);
		const [addressBooks, result] = await Promise.all([
			getAddressBooks(client, accountId),
			queryContacts(client, accountId, query, limit, position)
		]);

		return json({
			supported: true,
			capabilities,
			addressBooks,
			...result
		});
	} catch (error) {
		if (error instanceof ContactsUnsupportedError) {
			return json({
				supported: false,
				capabilities: null,
				addressBooks: [],
				contacts: [],
				queryState: '',
				total: 0
			});
		}
		if (error instanceof JMAPAuthError) {
			return json({ error: 'Mail account authentication failed' }, { status: 401 });
		}
		if (error instanceof JMAPError) {
			return json({ error: 'Unable to load contacts' }, { status: 502 });
		}
		throw error;
	}
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.auth) return json({ error: 'Not authenticated' }, { status: 401 });
	const body = (await request.json().catch(() => null)) as {
		action?: unknown;
		id?: unknown;
		contact?: ContactFormInput;
		contacts?: unknown;
	} | null;
	if (!body) return json({ error: 'Invalid JSON body' }, { status: 400 });

	try {
		const session = await fetchSession(locals.auth);
		const { accountId, capabilities } = resolveContactsAccount(session);
		const client = createClient(locals.auth);

		if (body.action === 'create') {
			const create = contactCreateFromInput(body.contact ?? {});
			const addressBooks = await getAddressBooks(client, accountId);
			validateAddressBookSelection(create.addressBookIds, addressBooks, capabilities.maxAddressBooksPerCard ?? null);
			const contact = await createContact(client, accountId, create);
			return json({ success: true, contact }, { status: 201 });
		}

		if (body.action === 'import') {
			if (!Array.isArray(body.contacts) || body.contacts.length === 0 || body.contacts.length > 50) {
				return json({ error: 'Import batches must contain between 1 and 50 contacts' }, { status: 400 });
			}
			const addressBooks = await getAddressBooks(client, accountId);
			const valid: Array<{ index: number; contact: ReturnType<typeof contactCreateFromInput> }> = [];
			const failures: Array<{
				index: number;
				error: string;
				type?: string;
				properties?: string[];
			}> = [];
			for (const [index, candidate] of body.contacts.entries()) {
				try {
					const contact = contactCreateFromInput(candidate as ContactFormInput);
					validateAddressBookSelection(
						contact.addressBookIds,
						addressBooks,
						capabilities.maxAddressBooksPerCard ?? null
					);
					valid.push({ index, contact });
				} catch (error) {
					if (!(error instanceof ContactValidationError)) throw error;
					failures.push({ index, error: error.message });
				}
			}

			const toCreate: typeof valid = [];
			if (valid.length > 0) {
				const existingContacts = await queryAllContacts(client, accountId);
				const knownEmails = new Set(
					existingContacts.flatMap((contact) =>
						Object.values(contact.emails ?? {}).map((email) => email.address.trim().toLowerCase())
					)
				);
				for (const entry of valid) {
					const emails = Object.values(entry.contact.emails ?? {})
						.map((email) => email.address.trim().toLowerCase());
					if (emails.some((email) => knownEmails.has(email))) {
						failures.push({
							index: entry.index,
							error: 'A contact with this email address already exists',
							type: 'duplicate'
						});
						continue;
					}
					toCreate.push(entry);
					for (const email of emails) knownEmails.add(email);
				}
			}

			const created: Array<{ index: number; contact: unknown }> = [];
			if (toCreate.length > 0) {
				const batch = await createContacts(client, accountId, toCreate.map((entry) => entry.contact));
				for (const entry of batch.created) {
					const localIndex = Number(entry.creationId.replace(/^import/, ''));
					const source = toCreate[localIndex];
					if (source) created.push({ index: source.index, contact: entry.contact });
				}
				for (const failure of batch.failures) {
					const localIndex = Number(failure.id.replace(/^import/, ''));
					const source = toCreate[localIndex];
					if (source) {
						failures.push({
							index: source.index,
							error: safeSetFailureDescription(failure.type),
							type: failure.type,
							properties: failure.properties
						});
					}
				}
			}
			failures.sort((left, right) => left.index - right.index);
			created.sort((left, right) => left.index - right.index);
			return json({
				success: failures.length === 0,
				imported: created.length,
				failed: failures.length,
				created,
				failures
			}, { status: failures.length === 0 ? 201 : 207 });
		}

		if (body.action === 'update') {
			const id = typeof body.id === 'string' ? body.id.trim() : '';
			if (!id || id.length > 255) return json({ error: 'Invalid contact id' }, { status: 400 });
			const [[existing], addressBooks] = await Promise.all([
				getContacts(client, accountId, [id]),
				getAddressBooks(client, accountId)
			]);
			if (!existing) return json({ error: 'Contact not found' }, { status: 404 });
			const patch = contactPatchFromInput(body.contact ?? {}, existing);
			validateAddressBookSelection(
				patch.addressBookIds as Record<string, boolean>,
				addressBooks,
				capabilities.maxAddressBooksPerCard ?? null
			);
			await updateContact(client, accountId, id, patch);
			return json({ success: true });
		}

		if (body.action === 'delete') {
			const id = typeof body.id === 'string' ? body.id.trim() : '';
			if (!id || id.length > 255) return json({ error: 'Invalid contact id' }, { status: 400 });
			await deleteContact(client, accountId, id);
			return json({ success: true });
		}

		return json({ error: 'Unknown action' }, { status: 400 });
	} catch (error) {
		if (error instanceof ContactValidationError) {
			return json({ error: error.message }, { status: 400 });
		}
		if (error instanceof ContactSetError) {
			return json({
				error: 'Contact change was rejected',
				failures: error.failures.map((failure) => ({
					...failure,
					description: safeSetFailureDescription(failure.type)
				}))
			}, { status: 422 });
		}
		if (error instanceof ContactsUnsupportedError) {
			return json({ supported: false, error: error.message }, { status: 501 });
		}
		if (error instanceof JMAPAuthError) {
			return json({ error: 'Mail account authentication failed' }, { status: 401 });
		}
		if (error instanceof JMAPError) {
			return json({ error: 'Unable to update contacts' }, { status: 502 });
		}
		throw error;
	}
};

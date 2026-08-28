import { randomUUID } from 'node:crypto';
import type { JMAPClient } from '$lib/jmap/client';
import type { JMAPSession } from '$lib/jmap/types';
import {
	ContactsUnsupportedError,
	createContact,
	getAddressBooks,
	queryContacts,
	resolveContactsAccount
} from '$lib/jmap/contacts';

/**
 * Trusting a sender, by putting them in the address book.
 *
 * This is not a workaround — it is the mechanism Stalwart itself documents.
 * Its spam filter reads the recipient's address book: with `trustContacts`
 * enabled (the default), a message from a known contact is treated as
 * legitimate regardless of the score it would otherwise get, and is fed back
 * as a ham training sample. So adding a contact is a per-sender exemption that
 * leaves the global threshold, the DNSBLs and every other rule exactly as
 * strict as they were.
 *
 * That is the point for the case this exists to solve: newsletters and
 * transactional mail from real organisations — a newspaper, a utility, a
 * hardware vendor — scoring as spam. The alternative, lowering the threshold,
 * would let everything else through with them.
 */

export type TrustResult =
	| { status: 'added'; email: string; name: string }
	| { status: 'already-trusted'; email: string }
	| { status: 'unsupported' };

/** Strip a `Name <addr>` wrapper and normalise for comparison. */
export function normalizeAddress(raw: string): string {
	let value = raw.trim();
	const angled = value.match(/<([^>]+)>/);
	if (angled) value = angled[1];
	return value.trim().toLowerCase();
}

/** Does this card already carry the address? */
function cardHasAddress(emails: unknown, email: string): boolean {
	if (!emails || typeof emails !== 'object') return false;
	return Object.values(emails as Record<string, { address?: string }>).some(
		(entry) => normalizeAddress(entry?.address ?? '') === email
	);
}

/**
 * Add `address` to the address book unless it is already there.
 *
 * Idempotent on purpose: the button that calls this sits on any message, and
 * pressing it twice should be a no-op rather than a duplicate card.
 */
export async function trustSender(
	client: JMAPClient,
	session: JMAPSession,
	address: string,
	displayName?: string | null
): Promise<TrustResult> {
	const email = normalizeAddress(address);
	if (!email || !email.includes('@')) return { status: 'unsupported' };

	let contactsAccountId: string;
	try {
		contactsAccountId = resolveContactsAccount(session).accountId;
	} catch (err) {
		// The mail server may not offer contacts at all. Not something the user
		// can act on here, so the caller downgrades to just moving the message.
		if (err instanceof ContactsUnsupportedError) return { status: 'unsupported' };
		throw err;
	}

	// A text query is a server-side substring match across the card, so it can
	// return near-misses; the address comparison below is what actually decides.
	const existing = await queryContacts(client, contactsAccountId, email, 20);
	if (existing.contacts.some((card) => cardHasAddress(card.emails, email))) {
		return { status: 'already-trusted', email };
	}

	const books = await getAddressBooks(client, contactsAccountId);
	const target = books.find((b) => b.isDefault && b.myRights?.mayWrite)
		?? books.find((b) => b.myRights?.mayWrite);
	if (!target) return { status: 'unsupported' };

	// A sender's display name is usually the brand ("Financial Times"), which is
	// exactly what belongs on the card. Fall back to the local part so a contact
	// is never nameless.
	const name = (displayName ?? '').trim() || email.split('@')[0];

	await createContact(client, contactsAccountId, {
		'@type': 'Card',
		version: '1.0',
		uid: `urn:uuid:${randomUUID()}`,
		kind: 'individual',
		name: { full: name },
		emails: { e1: { '@type': 'EmailAddress', address: email } },
		addressBookIds: { [target.id]: true }
	});

	return { status: 'added', email, name };
}

import type { EmailAddress } from '$lib/jmap/types';

export interface PendingContact {
	name: string;
	email: string;
}

let pendingContact: PendingContact | null = null;

export function queueSenderForContacts(sender: EmailAddress): string {
	pendingContact = {
		name: sender.name?.trim().slice(0, 255) ?? '',
		email: sender.email.trim().slice(0, 320)
	};
	return '/contacts';
}

export function takePendingContact(): PendingContact | null {
	const contact = pendingContact;
	pendingContact = null;
	return contact;
}

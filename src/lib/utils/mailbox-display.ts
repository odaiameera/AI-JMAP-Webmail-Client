import type { Mailbox } from '$lib/jmap/types';
import type { Label } from '$lib/types/labels';

/**
 * Resolve a mailbox to the name we show users. A label mailbox's own name is
 * already the display name; we still prefer the `data.labels` entry so a
 * SQLite-stored rename wins if the two ever drift.
 */
export function mailboxDisplayName(mailbox: Mailbox, labels: Label[]): string {
	const label = labels.find((l) => l.id === mailbox.id);
	return label?.name ?? mailbox.name;
}

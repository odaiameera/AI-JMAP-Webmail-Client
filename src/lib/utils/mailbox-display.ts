import type { Mailbox } from '$lib/jmap/types';
import type { Label } from '$lib/types/labels';
import { LABEL_PREFIX } from '$lib/types/labels';

/**
 * Resolve a mailbox to the name we show users. Label mailboxes carry a
 * `labels/` prefix in their JMAP `name`; UI should always show the user's
 * chosen pretty name from `data.labels` (or a stripped + capitalized
 * fallback if the meta cookie is missing).
 */
export function mailboxDisplayName(mailbox: Mailbox, labels: Label[]): string {
	if (!mailbox.name.startsWith(LABEL_PREFIX)) return mailbox.name;
	const label = labels.find((l) => l.id === mailbox.id);
	if (label) return label.name;
	const slug = mailbox.name.slice(LABEL_PREFIX.length);
	return slug.charAt(0).toUpperCase() + slug.slice(1);
}

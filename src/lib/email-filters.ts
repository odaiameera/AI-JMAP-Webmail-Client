/**
 * Quick filters shown above the email list. Each maps to a JMAP Email/query
 * condition that's AND-combined with the list's `inMailbox` constraint on the
 * server, so filtering stays correct across pagination (unlike client-side
 * filtering, which would only narrow the current page).
 */
export type ListFilterKey = 'all' | 'unread' | 'flagged' | 'attachments' | 'important';

export interface ListFilterDef {
	key: ListFilterKey;
	label: string;
}

export const LIST_FILTERS: ListFilterDef[] = [
	{ key: 'all', label: 'All' },
	{ key: 'unread', label: 'Unread' },
	{ key: 'flagged', label: 'Flagged' },
	{ key: 'important', label: 'Important' },
	{ key: 'attachments', label: 'Has attachment' }
];

const VALID = new Set<ListFilterKey>(LIST_FILTERS.map((f) => f.key));

/** Normalise a raw `?filter=` value to a known key, defaulting to `all`. */
export function parseListFilter(raw: string | null | undefined): ListFilterKey {
	return raw && VALID.has(raw as ListFilterKey) ? (raw as ListFilterKey) : 'all';
}

/** JMAP condition for a filter key, or null for `all` (no extra constraint). */
export function listFilterCondition(key: ListFilterKey): Record<string, unknown> | null {
	switch (key) {
		case 'unread':
			return { notKeyword: '$seen' };
		case 'flagged':
			return { hasKeyword: '$flagged' };
		case 'important':
			return { hasKeyword: '$important' };
		case 'attachments':
			return { hasAttachment: true };
		case 'all':
		default:
			return null;
	}
}

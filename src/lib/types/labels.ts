export interface Label {
	/** JMAP Mailbox id (authoritative — this is the mailbox id in JMAP/IMAP) */
	id: string;
	/** Display name (without the `labels/` prefix) */
	name: string;
	/** Hex color — stored in the `label_meta` cookie, keyed by id */
	color: string;
	createdAt: number;
}

/** Prefix used for all label mailbox names in JMAP. */
export const LABEL_PREFIX = 'labels/';

/** Cookie name for the id → { color, displayName, createdAt } map. */
export const LABEL_META_COOKIE = 'label_meta';

/** Cookie name for the migration marker (values: `v1`). */
export const LABEL_MIGRATION_COOKIE = 'mail_labels_migrated';

/** Legacy cookie holding the pre-migration keyword-based labels. */
export const LEGACY_LABELS_COOKIE = 'mail_labels';

/** Default color for labels that exist in JMAP but have no meta entry. */
export const DEFAULT_LABEL_COLOR = '#6366F1';

/**
 * Normalize a display name into a JMAP-safe slug that becomes the suffix
 * after `labels/`. Lowercased, ASCII-only, collapsed underscores.
 */
export function slugifyLabel(displayName: string): string {
	return displayName
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 64) || 'untitled';
}

/** Full JMAP mailbox name for a given display name. */
export function labelMailboxName(displayName: string): string {
	return LABEL_PREFIX + slugifyLabel(displayName);
}

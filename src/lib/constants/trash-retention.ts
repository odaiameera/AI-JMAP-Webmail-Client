/**
 * How long a message may sit in Trash before it is deleted for good.
 * 0 means never. Shared by the settings page, the preferences API and the
 * background sweep so all three agree on what a stored value means.
 */
export const TRASH_RETENTION_CHOICES = [0, 7, 30] as const;

export type TrashRetentionDays = (typeof TRASH_RETENTION_CHOICES)[number];

/** Read the stored preference; anything unrecognised means "never". */
export function parseTrashRetentionDays(raw: string | number | undefined | null): TrashRetentionDays {
	const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10);
	return (TRASH_RETENTION_CHOICES as readonly number[]).includes(n) ? (n as TrashRetentionDays) : 0;
}

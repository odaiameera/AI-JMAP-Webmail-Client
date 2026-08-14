/** Client helpers for sender avatars and their initials fallback. */

// A stable, theme-friendly palette for initials chips. Index is chosen by a
// hash of the address so a given sender always gets the same color.
const PALETTE = [
	'#6366F1', '#0EA5E9', '#10B981', '#F59E0B',
	'#EF4444', '#EC4899', '#8B5CF6', '#14B8A6',
	'#F97316', '#84CC16', '#06B6D4', '#A855F7'
];

/** Normalize a sender address: strip a "Name <addr>" wrapper, trim, lowercase. */
export function normalizeEmail(raw: string | null | undefined): string {
	if (!raw) return '';
	let e = raw.trim();
	const angle = e.match(/<([^>]+)>/);
	if (angle) e = angle[1];
	return e.trim().toLowerCase();
}

/** First alphanumeric character of the display name (or address), uppercased. */
export function initial(name?: string | null, email?: string | null): string {
	const src = (name && name.trim()) || (email && email.trim()) || '';
	for (const ch of src) {
		if (/[a-z0-9]/i.test(ch)) return ch.toUpperCase();
	}
	return '?';
}

/** Deterministic palette color for a seed string (the normalized address). */
export function avatarColor(seed: string): string {
	let h = 0;
	for (let i = 0; i < seed.length; i++) {
		h = (h * 31 + seed.charCodeAt(i)) | 0;
	}
	return PALETTE[Math.abs(h) % PALETTE.length];
}

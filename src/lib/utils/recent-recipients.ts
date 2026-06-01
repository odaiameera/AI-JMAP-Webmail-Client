/**
 * Lightweight recent-recipient memory backed by localStorage. There's no
 * contacts backend, so the composer's address autocomplete is seeded from
 * the people you've actually emailed. Most-recent-first, capped.
 */
const KEY = 'recent-recipients';
const MAX = 50;

export function getRecentRecipients(): string[] {
	if (typeof localStorage === 'undefined') return [];
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return [];
		const list = JSON.parse(raw);
		return Array.isArray(list) ? list.filter((x) => typeof x === 'string') : [];
	} catch {
		return [];
	}
}

export function rememberRecipients(emails: string[]): void {
	if (typeof localStorage === 'undefined') return;
	const clean = emails.map((e) => e.trim()).filter(Boolean);
	if (clean.length === 0) return;
	const existing = getRecentRecipients();
	// New entries first, de-duped case-insensitively, preserving original casing.
	const seen = new Set<string>();
	const merged: string[] = [];
	for (const e of [...clean, ...existing]) {
		const k = e.toLowerCase();
		if (seen.has(k)) continue;
		seen.add(k);
		merged.push(e);
	}
	try {
		localStorage.setItem(KEY, JSON.stringify(merged.slice(0, MAX)));
	} catch {
		// quota / private mode — non-fatal
	}
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
	return EMAIL_RE.test(value.trim());
}

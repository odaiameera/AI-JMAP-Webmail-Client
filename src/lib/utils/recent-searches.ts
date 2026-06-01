/**
 * Recent search queries, backed by localStorage. Surfaced in the search
 * panel on empty focus so a cold search isn't a blank stare.
 */
const KEY = 'recent-searches';
const MAX = 8;

export function getRecentSearches(): string[] {
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

export function rememberSearch(query: string): void {
	if (typeof localStorage === 'undefined') return;
	const q = query.trim();
	if (!q) return;
	const existing = getRecentSearches().filter((x) => x.toLowerCase() !== q.toLowerCase());
	try {
		localStorage.setItem(KEY, JSON.stringify([q, ...existing].slice(0, MAX)));
	} catch {
		// quota / private mode — non-fatal
	}
}

export function clearRecentSearches(): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.removeItem(KEY);
	} catch {
		// non-fatal
	}
}

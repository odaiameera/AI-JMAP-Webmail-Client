import type { Cookies } from '@sveltejs/kit';
import type { Rule } from '$lib/types/rules';
import { getRules, setRules, hasRulesRow } from './db/queries/rules';

const LEGACY_COOKIE = 'mail_rules';

/**
 * Load a user's rules from SQLite. If they have no row yet but a legacy
 * per-browser `mail_rules` cookie is present (pre-Phase rules storage), import
 * it once into SQLite and clear the cookie so rules become device-independent.
 */
export function loadRules(userEmail: string, cookies: Cookies): Rule[] {
	if (hasRulesRow(userEmail)) return getRules(userEmail);

	const raw = cookies.get(LEGACY_COOKIE);
	if (raw) {
		try {
			const parsed = JSON.parse(decodeURIComponent(raw));
			if (Array.isArray(parsed)) {
				setRules(userEmail, parsed as Rule[]);
				cookies.delete(LEGACY_COOKIE, { path: '/' });
				return parsed as Rule[];
			}
		} catch {
			// Malformed cookie — ignore and fall through to empty.
		}
	}
	return getRules(userEmail);
}

/** Persist a user's rules to SQLite and drop the legacy cookie if present. */
export function saveRules(userEmail: string, rules: Rule[], cookies: Cookies): void {
	setRules(userEmail, rules);
	if (cookies.get(LEGACY_COOKIE)) cookies.delete(LEGACY_COOKIE, { path: '/' });
}

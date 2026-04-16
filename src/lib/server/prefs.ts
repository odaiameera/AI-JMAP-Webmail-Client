import type { Cookies } from '@sveltejs/kit';

/**
 * Shared cookie options for every preference cookie. 1-year TTL, not
 * httpOnly (client-side reads preferences directly via parent layout
 * data rather than document.cookie, but leaving it readable keeps
 * debugging easy). Same-site strict + secure match the rest of the
 * session cookies.
 */
export const PREF_COOKIE_OPTIONS = {
	path: '/',
	maxAge: 60 * 60 * 24 * 365,
	httpOnly: false,
	sameSite: 'strict',
	secure: true
} as const;

export function setPref(cookies: Cookies, key: string, value: string): void {
	cookies.set(key, value, PREF_COOKIE_OPTIONS);
}

export function setPrefEncoded(cookies: Cookies, key: string, value: string): void {
	cookies.set(key, encodeURIComponent(value), PREF_COOKIE_OPTIONS);
}

export function setPrefJson(cookies: Cookies, key: string, value: unknown): void {
	cookies.set(key, encodeURIComponent(JSON.stringify(value)), PREF_COOKIE_OPTIONS);
}

export function deletePref(cookies: Cookies, key: string): void {
	cookies.delete(key, { path: '/' });
}

/** All preference cookie keys this app writes — kept in one place so
 *  export / import / reset stay exhaustive. */
export const PREF_COOKIE_KEYS = [
	// Account
	'display_name',
	'signature',
	// Appearance
	'theme',
	'density',
	'reading_pane',
	// Composer
	'composer_font',
	'composer_font_size',
	'undo_send',
	'autosave_interval',
	// Mail
	'conversation_view',
	'mark_read_delay',
	'auto_load_images',
	'default_sort',
	'keyboard_shortcuts',
	// Notifications
	'notifications',
	'notification_folders',
	// Auto-reply
	'auto_reply_enabled',
	'auto_reply_subject',
	'auto_reply_body',
	// Organization
	'mail_labels_migrated',
	'label_meta',
	'mail_rules',
	'folder_expanded'
] as const;

export type PrefKey = (typeof PREF_COOKIE_KEYS)[number];

/** Serialise every known preference cookie into a flat object for export. */
export function exportPrefs(cookies: Cookies): Record<string, string> {
	const out: Record<string, string> = {};
	for (const key of PREF_COOKIE_KEYS) {
		const value = cookies.get(key);
		if (value !== undefined) out[key] = value;
	}
	return out;
}

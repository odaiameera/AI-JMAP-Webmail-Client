/**
 * Cookie options for the one preference that is still a cookie.
 *
 * Preferences themselves moved to SQLite (see `preferences.ts`) so they follow
 * the person rather than the browser. What remains here is the `theme` render
 * hint: `app.html` runs an inline script before first paint and needs the
 * theme synchronously, which only a cookie can provide. SQLite stays the
 * source of truth and rewrites this cookie whenever the two disagree.
 *
 * The old `setPref` / `setPrefEncoded` / `setPrefJson` helpers and the
 * `PREF_COOKIE_KEYS` list are gone with the cookies they wrote — that list had
 * also drifted, still carrying `label_meta` long after label metadata moved to
 * its own table.
 */
export const PREF_COOKIE_OPTIONS = {
	path: '/',
	maxAge: 60 * 60 * 24 * 365,
	// Readable by the inline theme script in app.html, which runs before
	// hydration and so cannot ask the server.
	httpOnly: false,
	sameSite: 'strict',
	secure: true
} as const;

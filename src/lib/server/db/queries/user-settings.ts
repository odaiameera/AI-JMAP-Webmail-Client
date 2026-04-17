import { getDb } from '../index';

export interface UserSettingsRow {
	displayName: string | null;
	settings: Record<string, unknown>;
}

export interface AvatarRow {
	data: string;
	offset: { x: number; y: number; zoom: number };
}

/**
 * Lazy-prepared statement bundle. Building the statements at module
 * top-level would force the DB connection open during `vite build`'s
 * SSR pass; we prepare on first call instead, which means after
 * migrations have run.
 */
let _stmts: ReturnType<typeof prepareStmts> | null = null;
function prepareStmts() {
	const db = getDb();
	return {
		ensureRow: db.prepare(
			`INSERT INTO user_settings (user_email) VALUES (?)
			 ON CONFLICT (user_email) DO NOTHING`
		),
		getSettings: db.prepare(
			`SELECT display_name AS displayName, settings
			 FROM user_settings WHERE user_email = ?`
		),
		updateDisplayName: db.prepare(
			`UPDATE user_settings SET display_name = ?, updated_at = datetime('now')
			 WHERE user_email = ?`
		),
		getSettingsJson: db.prepare(
			`SELECT settings FROM user_settings WHERE user_email = ?`
		),
		updateSettingsJson: db.prepare(
			`UPDATE user_settings SET settings = ?, updated_at = datetime('now')
			 WHERE user_email = ?`
		),
		getAvatar: db.prepare(
			`SELECT avatar_data AS data, avatar_offset AS offset
			 FROM user_settings WHERE user_email = ?`
		),
		setAvatar: db.prepare(
			`UPDATE user_settings SET avatar_data = ?, avatar_offset = ?, updated_at = datetime('now')
			 WHERE user_email = ?`
		)
	};
}
function stmts() {
	return (_stmts ??= prepareStmts());
}

export function getUserSettings(userEmail: string): UserSettingsRow {
	const s = stmts();
	s.ensureRow.run(userEmail);
	const row = s.getSettings.get(userEmail) as
		| { displayName: string | null; settings: string }
		| undefined;
	if (!row) return { displayName: null, settings: {} };
	let settings: Record<string, unknown> = {};
	try {
		settings = JSON.parse(row.settings || '{}');
	} catch {
		// Corrupt JSON — start over rather than throw, the user can re-save.
	}
	return { displayName: row.displayName, settings };
}

export function setDisplayName(userEmail: string, displayName: string): void {
	const s = stmts();
	s.ensureRow.run(userEmail);
	s.updateDisplayName.run(displayName, userEmail);
}

/**
 * Shallow-merge `patch` into the existing settings JSON. Top-level keys
 * are replaced wholesale — pass an empty object to clear nothing.
 */
export function patchSettings(userEmail: string, patch: Record<string, unknown>): void {
	const s = stmts();
	s.ensureRow.run(userEmail);
	const row = s.getSettingsJson.get(userEmail) as { settings: string } | undefined;
	let current: Record<string, unknown> = {};
	if (row) {
		try {
			current = JSON.parse(row.settings || '{}');
		} catch {
			// fall through; we'll overwrite the corrupt blob
		}
	}
	const merged = { ...current, ...patch };
	s.updateSettingsJson.run(JSON.stringify(merged), userEmail);
}

export function getAvatar(userEmail: string): AvatarRow | null {
	const row = stmts().getAvatar.get(userEmail) as
		| { data: string | null; offset: string | null }
		| undefined;
	if (!row || !row.data) return null;
	let offset = { x: 0, y: 0, zoom: 1 };
	if (row.offset) {
		try {
			const parsed = JSON.parse(row.offset);
			if (parsed && typeof parsed === 'object') {
				offset = {
					x: typeof parsed.x === 'number' ? parsed.x : 0,
					y: typeof parsed.y === 'number' ? parsed.y : 0,
					zoom: typeof parsed.zoom === 'number' ? parsed.zoom : 1
				};
			}
		} catch {
			// keep defaults
		}
	}
	return { data: row.data, offset };
}

export function setAvatar(
	userEmail: string,
	data: string,
	offset: { x: number; y: number; zoom: number }
): void {
	const s = stmts();
	s.ensureRow.run(userEmail);
	s.setAvatar.run(data, JSON.stringify(offset), userEmail);
}

export function clearAvatar(userEmail: string): void {
	const s = stmts();
	s.ensureRow.run(userEmail);
	s.setAvatar.run(null, null, userEmail);
}

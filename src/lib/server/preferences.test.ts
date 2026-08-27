import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Cookies } from '@sveltejs/kit';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Point the lazy SQLite singleton at a throwaway file before anything opens
// it. Every module here defers getDb() to first call, so setting this before
// the first query runs is enough.
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'ameera-prefs-')), 'test.db');

import { getDb } from './db/index';
import { runMigrations } from './db/migrate';
import { getPrefs, getDisplayName, setDisplayName } from './db/queries/app-prefs';
import {
	readPreferences,
	writePreferences,
	resetPreferences,
	importPreferences,
	exportPreferences
} from './preferences';

const USER = 'user-1';
const OTHER = 'user-2';

/** Minimal in-memory stand-in for SvelteKit's cookie jar. */
function fakeCookies(initial: Record<string, string> = {}) {
	const jar = new Map(Object.entries(initial));
	const cookies = {
		get: (name: string) => jar.get(name),
		set: (name: string, value: string) => void jar.set(name, value),
		delete: (name: string) => void jar.delete(name),
		getAll: () => [...jar].map(([name, value]) => ({ name, value })),
		serialize: () => ''
	} as unknown as Cookies;
	return { cookies, jar };
}

beforeAll(() => {
	runMigrations();
	// The two users the tests act as; app_prefs rows cascade from app_user.
	const db = getDb();
	for (const id of [USER, OTHER]) {
		db.prepare(
			`INSERT INTO app_user (id, email, password_hash) VALUES (?, ?, 'x')
			 ON CONFLICT (id) DO NOTHING`
		).run(id, `${id}@example.test`);
	}
});

beforeEach(() => {
	getDb().exec('DELETE FROM app_prefs');
});

describe('migration off cookies', () => {
	it('imports legacy cookies once, then clears them', () => {
		const { cookies, jar } = fakeCookies({ theme: 'light', density: 'compact' });

		expect(readPreferences(USER, cookies)).toMatchObject({
			theme: 'light',
			density: 'compact'
		});
		// Stored, so a browser without the cookies still sees them.
		expect(getPrefs(USER)).toMatchObject({ theme: 'light', density: 'compact' });
		// Retired — except the theme hint, which the pre-paint script needs.
		expect(jar.has('density')).toBe(false);
		expect(jar.get('theme')).toBe('light');
	});

	it('decodes values the legacy cookie stored percent-encoded', () => {
		const body = 'Back on the 14th.\nRegards, Odai';
		const { cookies } = fakeCookies({
			auto_reply_body: encodeURIComponent(body),
			notification_folders: encodeURIComponent(JSON.stringify(['inbox', 'team']))
		});

		const prefs = readPreferences(USER, cookies);
		expect(prefs.auto_reply_body).toBe(body);
		expect(JSON.parse(prefs.notification_folders)).toEqual(['inbox', 'team']);
	});

	it('does not let a stale cookie overwrite a stored preference', () => {
		writePreferences(USER, { theme: 'dark' });
		// A second browser still carrying an old cookie must not win.
		const { cookies } = fakeCookies({ theme: 'light', density: 'compact' });

		const prefs = readPreferences(USER, cookies);
		expect(prefs.theme).toBe('dark');
		expect(prefs.density).toBeUndefined();
	});

	it('rewrites the theme hint cookie when it disagrees with storage', () => {
		writePreferences(USER, { theme: 'light' });
		const { cookies, jar } = fakeCookies({});

		readPreferences(USER, cookies);
		expect(jar.get('theme')).toBe('light');
	});
});

describe('storage', () => {
	it('holds a value far past the ~4KB cookie cap', () => {
		// The case that silently broke the vacation responder: a long body was
		// percent-encoded into a cookie and dropped past the browser's limit.
		const long = 'Away until the 14th. '.repeat(400);
		expect(long.length).toBeGreaterThan(4096);

		writePreferences(USER, { auto_reply_body: long });
		const { cookies } = fakeCookies({});
		expect(readPreferences(USER, cookies).auto_reply_body).toBe(long);
	});

	it('keeps each user\'s preferences and name to themselves', () => {
		writePreferences(USER, { theme: 'light' });
		setDisplayName(USER, 'Odai');
		writePreferences(OTHER, { theme: 'dark' });

		expect(getPrefs(USER).theme).toBe('light');
		expect(getPrefs(OTHER).theme).toBe('dark');
		expect(getDisplayName(USER)).toBe('Odai');
		expect(getDisplayName(OTHER)).toBeNull();
	});

	it('merges patches rather than replacing the map', () => {
		writePreferences(USER, { theme: 'light', density: 'compact' });
		writePreferences(USER, { density: 'comfortable' });

		expect(getPrefs(USER)).toMatchObject({ theme: 'light', density: 'comfortable' });
	});
});

describe('reset, export and import', () => {
	it('reset clears preferences but keeps the identity', () => {
		writePreferences(USER, { theme: 'light' });
		setDisplayName(USER, 'Odai');
		const { cookies, jar } = fakeCookies({ theme: 'light' });

		resetPreferences(USER, cookies);

		expect(getPrefs(USER)).toEqual({});
		expect(getDisplayName(USER)).toBe('Odai');
		expect(jar.has('theme')).toBe(false);
	});

	it('import keeps known keys and drops anything else', () => {
		const { cookies } = fakeCookies({});
		importPreferences(
			USER,
			{ theme: 'light', density: 'compact', evil: 'x', notANumber: 5 },
			cookies
		);

		const stored = exportPreferences(USER);
		expect(stored).toMatchObject({ theme: 'light', density: 'compact' });
		expect(stored.evil).toBeUndefined();
		expect(stored.notANumber).toBeUndefined();
	});

	it('survives a corrupt prefs blob instead of throwing', () => {
		getDb()
			.prepare(`INSERT INTO app_prefs (user_id, prefs) VALUES (?, 'not json')`)
			.run(USER);

		const { cookies } = fakeCookies({});
		expect(readPreferences(USER, cookies)).toEqual({});
		// And is repaired by the next write.
		writePreferences(USER, { theme: 'dark' });
		expect(getPrefs(USER)).toEqual({ theme: 'dark' });
	});
});

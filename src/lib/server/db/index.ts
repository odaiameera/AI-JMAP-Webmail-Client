import Database, { type Database as DbType } from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';

/**
 * Lazy SQLite singleton for per-user state. Importing this module is
 * side-effect free — the connection (and the `mkdirSync` it depends on)
 * is only opened when {@link getDb} is first called.
 *
 * Why lazy: `vite build` evaluates server modules during the SSR pass,
 * including imported helpers. If we opened the DB at module top-level,
 * the build would try to mkdirSync('/data') inside the build container
 * (where it doesn't exist) and fail before producing any output. The
 * actual production runtime calls `getDb()` from `runMigrations()` in
 * `hooks.server.ts` on the first request, after the volume is mounted.
 */
let cached: DbType | null = null;

function resolveDbPath(): string {
	if (process.env.DATABASE_PATH) return process.env.DATABASE_PATH;
	if (process.env.NODE_ENV === 'production') return '/data/ameera.db';
	return resolve(process.cwd(), 'local-data/ameera.db');
}

export function getDb(): DbType {
	if (cached) return cached;

	const dbPath = resolveDbPath();
	mkdirSync(dirname(dbPath), { recursive: true });

	const db = new Database(dbPath);
	// WAL gives us concurrent reads while a write is in flight; the rest
	// are the standard "web app, not a financial ledger" pragmas.
	db.pragma('journal_mode = WAL');
	db.pragma('synchronous = NORMAL');
	db.pragma('foreign_keys = ON');
	db.pragma('busy_timeout = 5000');

	cached = db;
	return db;
}

import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';

/**
 * SQLite singleton for per-user state (avatar, label/folder metadata,
 * signatures, user settings). The DB lives at `DATABASE_PATH`, which the
 * docker-compose file points at a mounted `/data` volume so the file
 * survives container rebuilds.
 *
 * In local dev nothing is mounted at /data, so we fall back to a repo-
 * relative path that's ignored by git.
 */
function resolveDbPath(): string {
	if (process.env.DATABASE_PATH) return process.env.DATABASE_PATH;
	if (process.env.NODE_ENV === 'production') return '/data/ameera.db';
	return resolve(process.cwd(), 'local-data/ameera.db');
}

const dbPath = resolveDbPath();
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);

// WAL gives us concurrent reads while a write is in flight; the rest of
// these pragmas are the standard "web app, not a financial ledger" set.
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

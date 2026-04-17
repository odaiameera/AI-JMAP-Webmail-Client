import { db } from './index';

/**
 * Bundle migration SQL into the build at compile time. `readdirSync` from
 * `src/lib/server/db/migrations/` would only work in dev — the production
 * build ships `build/`, not `src/`. Vite's eager glob with `?raw` inlines
 * each .sql file as a string the runtime can execute directly.
 */
const MIGRATION_SOURCES = import.meta.glob('./migrations/*.sql', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

export function runMigrations(): void {
	db.exec(`
		CREATE TABLE IF NOT EXISTS _migrations (
			name       TEXT PRIMARY KEY,
			applied_at TEXT NOT NULL DEFAULT (datetime('now'))
		)
	`);

	const seen = db.prepare('SELECT 1 FROM _migrations WHERE name = ?');
	const mark = db.prepare('INSERT INTO _migrations (name) VALUES (?)');

	const ordered = Object.keys(MIGRATION_SOURCES).sort();

	for (const path of ordered) {
		const name = path.split('/').pop() ?? path;
		if (seen.get(name)) continue;

		const sql = MIGRATION_SOURCES[path];
		const tx = db.transaction(() => {
			db.exec(sql);
			mark.run(name);
		});

		try {
			tx();
		} catch {
			// Silent — failures surface through subsequent request errors
			// rather than spamming logs on every container start.
		}
	}
}

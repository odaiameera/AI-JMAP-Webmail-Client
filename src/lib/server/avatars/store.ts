import { getDb } from '../db/index';

/** A single row of the avatar_cache table. */
export type CacheRow = {
	status: 'found' | 'missing';
	source: string | null;
	content_type: string | null;
	bytes: Buffer | null;
	fetched_at: number;
};

export function getCache(key: string): CacheRow | undefined {
	const db = getDb();
	return db
		.prepare(
			'SELECT status, source, content_type, bytes, fetched_at FROM avatar_cache WHERE key = ?'
		)
		.get(key) as CacheRow | undefined;
}

export function putCache(key: string, row: CacheRow): void {
	const db = getDb();
	db.prepare(
		`INSERT INTO avatar_cache (key, status, source, content_type, bytes, fetched_at)
		 VALUES (@key, @status, @source, @content_type, @bytes, @fetched_at)
		 ON CONFLICT(key) DO UPDATE SET
			status = @status, source = @source, content_type = @content_type,
			bytes = @bytes, fetched_at = @fetched_at`
	).run({
		key,
		status: row.status,
		source: row.source,
		content_type: row.content_type,
		// better-sqlite3 binds a Buffer as a BLOB and null as NULL.
		bytes: row.bytes,
		fetched_at: row.fetched_at
	});
}

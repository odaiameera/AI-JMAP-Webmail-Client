import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index';

/**
 * DB-backed webmail sessions. Unlike the old in-memory map, these survive
 * container restarts — nobody gets logged out by a deploy, and background
 * schedulers no longer depend on a live login at all (they read
 * mail_accounts directly).
 *
 * Sliding expiration: every authenticated request inside the renewal
 * window pushes expires_at forward, capped at SESSION_TTL from last use.
 */

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const TOUCH_INTERVAL_MS = 60 * 1000; // don't write on every asset request

export interface AppSessionRow {
	id: string;
	user_id: string;
	created_at: string;
	last_seen_at: string;
	user_agent: string | null;
	ip: string | null;
}

let _stmts: ReturnType<typeof prepareStmts> | null = null;
function prepareStmts() {
	const db = getDb();
	return {
		insert: db.prepare(
			`INSERT INTO app_sessions (id, user_id, expires_at, user_agent, ip)
			 VALUES (?, ?, ?, ?, ?)`
		),
		get: db.prepare(
			`SELECT id, user_id, created_at, last_seen_at, user_agent, ip, expires_at
			 FROM app_sessions WHERE id = ?`
		),
		touch: db.prepare(
			`UPDATE app_sessions SET last_seen_at = datetime('now'), expires_at = ? WHERE id = ?`
		),
		del: db.prepare(`DELETE FROM app_sessions WHERE id = ?`),
		delForUser: db.prepare(`DELETE FROM app_sessions WHERE user_id = ? AND id != ?`),
		list: db.prepare(
			`SELECT id, user_id, created_at, last_seen_at, user_agent, ip
			 FROM app_sessions WHERE user_id = ? ORDER BY last_seen_at DESC`
		),
		prune: db.prepare(`DELETE FROM app_sessions WHERE expires_at < datetime('now')`)
	};
}
function stmts() {
	return (_stmts ??= prepareStmts());
}

function expiryFromNow(): string {
	return new Date(Date.now() + SESSION_TTL_MS).toISOString().replace('T', ' ').slice(0, 19);
}

export function createAppSession(userId: string, userAgent?: string, ip?: string): string {
	const id = randomUUID();
	stmts().insert.run(id, userId, expiryFromNow(), userAgent ?? null, ip ?? null);
	return id;
}

export function getAppSession(id: string): AppSessionRow | undefined {
	const row = stmts().get.get(id) as (AppSessionRow & { expires_at: string }) | undefined;
	if (!row) return undefined;
	if (new Date(row.expires_at + 'Z').getTime() < Date.now()) {
		stmts().del.run(id);
		return undefined;
	}
	// Slide the expiry forward, throttled so static-asset bursts stay cheap.
	if (Date.now() - new Date(row.last_seen_at + 'Z').getTime() > TOUCH_INTERVAL_MS) {
		stmts().touch.run(expiryFromNow(), id);
	}
	return row;
}

export function deleteAppSession(id: string): void {
	stmts().del.run(id);
}

/** Sign out everywhere else — used after a password change. */
export function revokeOtherSessions(userId: string, keepId: string): void {
	stmts().delForUser.run(userId, keepId);
}

export function listSessions(userId: string): AppSessionRow[] {
	stmts().prune.run();
	return stmts().list.all(userId) as AppSessionRow[];
}

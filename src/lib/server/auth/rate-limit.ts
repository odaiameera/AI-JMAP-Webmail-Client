import { getDb } from '../db/index';

/**
 * Fixed-window login rate limiting, persisted in SQLite so a container
 * restart doesn't reset an attacker's counter. 10 failures within a
 * 15-minute window locks the email+IP pair out for 15 minutes.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const LOCKOUT_MS = 15 * 60 * 1000;

let _stmts: ReturnType<typeof prepareStmts> | null = null;
function prepareStmts() {
	const db = getDb();
	return {
		get: db.prepare(`SELECT window_start, count, locked_until FROM login_attempts WHERE key = ?`),
		upsert: db.prepare(
			`INSERT INTO login_attempts (key, window_start, count, locked_until)
			 VALUES (@key, @windowStart, @count, @lockedUntil)
			 ON CONFLICT (key) DO UPDATE
			   SET window_start = @windowStart, count = @count, locked_until = @lockedUntil`
		),
		clear: db.prepare(`DELETE FROM login_attempts WHERE key = ?`)
	};
}
function stmts() {
	return (_stmts ??= prepareStmts());
}

function keyFor(email: string, ip: string): string {
	return `${email.trim().toLowerCase()}|${ip}`;
}

/** True if this email+IP is currently locked out. */
export function isLockedOut(email: string, ip: string): boolean {
	const row = stmts().get.get(keyFor(email, ip)) as
		| { window_start: string; count: number; locked_until: string | null }
		| undefined;
	if (!row?.locked_until) return false;
	return new Date(row.locked_until).getTime() > Date.now();
}

export function recordFailure(email: string, ip: string): void {
	const key = keyFor(email, ip);
	const now = Date.now();
	const row = stmts().get.get(key) as
		| { window_start: string; count: number; locked_until: string | null }
		| undefined;

	let windowStart = now;
	let count = 1;
	if (row && now - new Date(row.window_start).getTime() < WINDOW_MS) {
		windowStart = new Date(row.window_start).getTime();
		count = row.count + 1;
	}
	const lockedUntil = count >= MAX_FAILURES ? new Date(now + LOCKOUT_MS).toISOString() : null;
	stmts().upsert.run({
		key,
		windowStart: new Date(windowStart).toISOString(),
		count,
		lockedUntil
	});
}

export function recordSuccess(email: string, ip: string): void {
	stmts().clear.run(keyFor(email, ip));
}

import { randomUUID } from 'node:crypto';
import { getDb } from '../db/index';
import { hashPassword, verifyPassword } from './password';

export interface AppUser {
	id: string;
	email: string;
}

let _stmts: ReturnType<typeof prepareStmts> | null = null;
function prepareStmts() {
	const db = getDb();
	return {
		count: db.prepare(`SELECT COUNT(*) AS n FROM app_user`),
		byEmail: db.prepare(`SELECT id, email, password_hash FROM app_user WHERE email = ?`),
		byId: db.prepare(`SELECT id, email FROM app_user WHERE id = ?`),
		first: db.prepare(`SELECT id, email FROM app_user ORDER BY created_at LIMIT 1`),
		insert: db.prepare(`INSERT INTO app_user (id, email, password_hash) VALUES (?, ?, ?)`),
		setPassword: db.prepare(
			`UPDATE app_user SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`
		),
		getHash: db.prepare(`SELECT password_hash FROM app_user WHERE id = ?`)
	};
}
function stmts() {
	return (_stmts ??= prepareStmts());
}

/** True once /setup has been completed. Gates the first-run flow. */
export function hasAppUser(): boolean {
	return (stmts().count.get() as { n: number }).n > 0;
}

export function createAppUser(email: string, password: string): AppUser {
	const id = randomUUID();
	stmts().insert.run(id, email.trim().toLowerCase(), hashPassword(password));
	return { id, email: email.trim().toLowerCase() };
}

export function getUserById(id: string): AppUser | undefined {
	return stmts().byId.get(id) as AppUser | undefined;
}

/** The sole webmail user — used for usernameless passkey login. */
export function getFirstUser(): AppUser | undefined {
	return stmts().first.get() as AppUser | undefined;
}

export function verifyUserPassword(email: string, password: string): AppUser | undefined {
	const row = stmts().byEmail.get(email.trim().toLowerCase()) as
		| { id: string; email: string; password_hash: string }
		| undefined;
	if (!row) {
		// Burn comparable time so absent vs. wrong-password is not observable.
		verifyPassword(password, hashPassword('timing-equalizer'));
		return undefined;
	}
	if (!verifyPassword(password, row.password_hash)) return undefined;
	return { id: row.id, email: row.email };
}

export function changePassword(userId: string, current: string, next: string): boolean {
	const row = stmts().getHash.get(userId) as { password_hash: string } | undefined;
	if (!row || !verifyPassword(current, row.password_hash)) return false;
	stmts().setPassword.run(hashPassword(next), userId);
	return true;
}

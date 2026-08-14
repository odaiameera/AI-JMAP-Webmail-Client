import { getDb } from '../db/index';

export interface PasskeyRow {
	id: string; // credential id, base64url
	user_id: string;
	public_key: string; // COSE public key, base64url
	counter: number;
	transports: string | null; // JSON array
	name: string;
	created_at: string;
	last_used_at: string | null;
}

let _stmts: ReturnType<typeof prepareStmts> | null = null;
function prepareStmts() {
	const db = getDb();
	return {
		insert: db.prepare(
			`INSERT INTO passkeys (id, user_id, public_key, counter, transports, name)
			 VALUES (?, ?, ?, ?, ?, ?)`
		),
		byId: db.prepare(`SELECT * FROM passkeys WHERE id = ?`),
		listForUser: db.prepare(`SELECT * FROM passkeys WHERE user_id = ? ORDER BY created_at`),
		countAll: db.prepare(`SELECT COUNT(*) AS n FROM passkeys`),
		touch: db.prepare(
			`UPDATE passkeys SET counter = ?, last_used_at = datetime('now') WHERE id = ?`
		),
		rename: db.prepare(`UPDATE passkeys SET name = ? WHERE id = ? AND user_id = ?`),
		remove: db.prepare(`DELETE FROM passkeys WHERE id = ? AND user_id = ?`),

		challengeInsert: db.prepare(
			`INSERT INTO webauthn_challenges (challenge, user_id, type, expires_at) VALUES (?, ?, ?, ?)`
		),
		challengeTake: db.prepare(`SELECT user_id, type, expires_at FROM webauthn_challenges WHERE challenge = ?`),
		challengeDelete: db.prepare(`DELETE FROM webauthn_challenges WHERE challenge = ?`),
		challengePrune: db.prepare(`DELETE FROM webauthn_challenges WHERE expires_at < datetime('now')`)
	};
}
function stmts() {
	return (_stmts ??= prepareStmts());
}

export function insertPasskey(row: {
	id: string;
	userId: string;
	publicKey: string;
	counter: number;
	transports: string[] | undefined;
	name: string;
}): void {
	stmts().insert.run(
		row.id,
		row.userId,
		row.publicKey,
		row.counter,
		row.transports ? JSON.stringify(row.transports) : null,
		row.name
	);
}

export function getPasskey(id: string): PasskeyRow | undefined {
	return stmts().byId.get(id) as PasskeyRow | undefined;
}

export function listPasskeys(userId: string): PasskeyRow[] {
	return stmts().listForUser.all(userId) as PasskeyRow[];
}

export function anyPasskeysExist(): boolean {
	return (stmts().countAll.get() as { n: number }).n > 0;
}

export function touchPasskey(id: string, counter: number): void {
	stmts().touch.run(counter, id);
}

export function renamePasskey(userId: string, id: string, name: string): void {
	stmts().rename.run(name, id, userId);
}

export function deletePasskey(userId: string, id: string): void {
	stmts().remove.run(id, userId);
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export function storeChallenge(challenge: string, userId: string | null, type: 'reg' | 'auth'): void {
	stmts().challengePrune.run();
	const expires = new Date(Date.now() + CHALLENGE_TTL_MS)
		.toISOString()
		.replace('T', ' ')
		.slice(0, 19);
	stmts().challengeInsert.run(challenge, userId, type, expires);
}

/**
 * Single-use lookup: returns the challenge row if it was issued by us,
 * matches the expected type, and hasn't expired — then deletes it either
 * way so replays fail.
 */
export function consumeChallenge(
	challenge: string,
	type: 'reg' | 'auth'
): { userId: string | null } | undefined {
	const row = stmts().challengeTake.get(challenge) as
		| { user_id: string | null; type: string; expires_at: string }
		| undefined;
	if (!row) return undefined;
	stmts().challengeDelete.run(challenge);
	if (row.type !== type) return undefined;
	if (new Date(row.expires_at + 'Z').getTime() < Date.now()) return undefined;
	return { userId: row.user_id };
}

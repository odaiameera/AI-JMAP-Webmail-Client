import { getDb } from '../index';

export interface IdentitySignatureRow {
	identityId: string;
	signatureId: number;
}

interface DbRow {
	identity_id: string;
	signature_id: number;
}

let _stmts: ReturnType<typeof prepareStmts> | null = null;
function prepareStmts() {
	const db = getDb();
	return {
		list: db.prepare(
			`SELECT identity_id, signature_id
			 FROM identity_signatures WHERE user_email = ?`
		),
		upsert: db.prepare(
			`INSERT INTO identity_signatures (user_email, identity_id, signature_id)
			 VALUES (?, ?, ?)
			 ON CONFLICT(user_email, identity_id) DO UPDATE SET
			   signature_id = excluded.signature_id`
		),
		remove: db.prepare(
			`DELETE FROM identity_signatures WHERE user_email = ? AND identity_id = ?`
		)
	};
}
function stmts() {
	return (_stmts ??= prepareStmts());
}

export function listIdentitySignatures(userEmail: string): IdentitySignatureRow[] {
	const rows = stmts().list.all(userEmail) as DbRow[];
	return rows.map((r) => ({ identityId: r.identity_id, signatureId: r.signature_id }));
}

export function setIdentitySignature(
	userEmail: string,
	identityId: string,
	signatureId: number
): void {
	stmts().upsert.run(userEmail, identityId, signatureId);
}

export function clearIdentitySignature(userEmail: string, identityId: string): void {
	stmts().remove.run(userEmail, identityId);
}

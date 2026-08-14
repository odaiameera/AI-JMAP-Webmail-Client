import { getDb } from '../index';

export interface SignatureRow {
	id: number;
	name: string;
	html: string;
	isDefault: boolean;
}

interface DbSignatureRow {
	id: number;
	name: string;
	html: string;
	isDefault: number;
}

let _stmts: ReturnType<typeof prepareStmts> | null = null;
function prepareStmts() {
	const db = getDb();
	return {
		list: db.prepare(
			`SELECT id, name, html, is_default AS isDefault
			 FROM signatures WHERE user_email = ?
			 ORDER BY is_default DESC, id ASC`
		),
		getOne: db.prepare(
			`SELECT id, name, html, is_default AS isDefault
			 FROM signatures WHERE id = ? AND user_email = ?`
		),
		insert: db.prepare(
			`INSERT INTO signatures (user_email, name, html, is_default)
			 VALUES (@userEmail, @name, @html, @isDefault)`
		),
		clearDefault: db.prepare(
			`UPDATE signatures SET is_default = 0, updated_at = datetime('now')
			 WHERE user_email = ? AND is_default = 1`
		),
		update: db.prepare(
			`UPDATE signatures
			 SET name       = COALESCE(@name, name),
			     html       = COALESCE(@html, html),
			     is_default = COALESCE(@isDefault, is_default),
			     updated_at = datetime('now')
			 WHERE id = @id AND user_email = @userEmail`
		),
		delete: db.prepare(
			`DELETE FROM signatures WHERE id = ? AND user_email = ?`
		),
		getDefault: db.prepare(
			`SELECT id, name, html, is_default AS isDefault
			 FROM signatures WHERE user_email = ? AND is_default = 1
			 LIMIT 1`
		)
	};
}
function stmts() {
	return (_stmts ??= prepareStmts());
}

function rowToSignature(row: DbSignatureRow | undefined): SignatureRow | null {
	if (!row) return null;
	return {
		id: row.id,
		name: row.name,
		html: row.html,
		isDefault: row.isDefault === 1
	};
}

export function listSignatures(userEmail: string): SignatureRow[] {
	const rows = stmts().list.all(userEmail) as DbSignatureRow[];
	return rows.map((r) => rowToSignature(r) as SignatureRow);
}

export function getDefaultSignature(userEmail: string): SignatureRow | null {
	return rowToSignature(stmts().getDefault.get(userEmail) as DbSignatureRow | undefined);
}

export function createSignature(
	userEmail: string,
	name: string,
	html: string,
	isDefault: boolean
): SignatureRow {
	const s = stmts();
	const tx = getDb().transaction(() => {
		if (isDefault) s.clearDefault.run(userEmail);
		const result = s.insert.run({
			userEmail,
			name,
			html,
			isDefault: isDefault ? 1 : 0
		});
		return Number(result.lastInsertRowid);
	});

	const id = tx();
	const created = s.getOne.get(id, userEmail) as DbSignatureRow | undefined;
	return rowToSignature(created) as SignatureRow;
}

export function updateSignature(
	userEmail: string,
	id: number,
	patch: { name?: string | null; html?: string | null; isDefault?: boolean | null }
): SignatureRow | null {
	const s = stmts();
	const tx = getDb().transaction(() => {
		// Promoting this row to default? Strip the flag from any sibling
		// first so the partial-unique index can't fail.
		if (patch.isDefault === true) s.clearDefault.run(userEmail);
		s.update.run({
			userEmail,
			id,
			name: patch.name ?? null,
			html: patch.html ?? null,
			isDefault:
				patch.isDefault === undefined || patch.isDefault === null
					? null
					: patch.isDefault
						? 1
						: 0
		});
	});

	tx();
	return rowToSignature(s.getOne.get(id, userEmail) as DbSignatureRow | undefined);
}

export function deleteSignature(userEmail: string, id: number): void {
	stmts().delete.run(id, userEmail);
}

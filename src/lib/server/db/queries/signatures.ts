import { db } from '../index';

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

const listStmt = db.prepare(
	`SELECT id, name, html, is_default AS isDefault
	 FROM signatures WHERE user_email = ?
	 ORDER BY is_default DESC, id ASC`
);

const getOneStmt = db.prepare(
	`SELECT id, name, html, is_default AS isDefault
	 FROM signatures WHERE id = ? AND user_email = ?`
);

const insertStmt = db.prepare(
	`INSERT INTO signatures (user_email, name, html, is_default)
	 VALUES (@userEmail, @name, @html, @isDefault)`
);

const clearDefaultStmt = db.prepare(
	`UPDATE signatures SET is_default = 0, updated_at = datetime('now')
	 WHERE user_email = ? AND is_default = 1`
);

const updateStmt = db.prepare(
	`UPDATE signatures
	 SET name       = COALESCE(@name, name),
	     html       = COALESCE(@html, html),
	     is_default = COALESCE(@isDefault, is_default),
	     updated_at = datetime('now')
	 WHERE id = @id AND user_email = @userEmail`
);

const deleteStmt = db.prepare(
	`DELETE FROM signatures WHERE id = ? AND user_email = ?`
);

const getDefaultStmt = db.prepare(
	`SELECT id, name, html, is_default AS isDefault
	 FROM signatures WHERE user_email = ? AND is_default = 1
	 LIMIT 1`
);

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
	const rows = listStmt.all(userEmail) as DbSignatureRow[];
	return rows.map((r) => rowToSignature(r) as SignatureRow);
}

export function getDefaultSignature(userEmail: string): SignatureRow | null {
	return rowToSignature(getDefaultStmt.get(userEmail) as DbSignatureRow | undefined);
}

export function createSignature(
	userEmail: string,
	name: string,
	html: string,
	isDefault: boolean
): SignatureRow {
	const tx = db.transaction(() => {
		if (isDefault) clearDefaultStmt.run(userEmail);
		const result = insertStmt.run({
			userEmail,
			name,
			html,
			isDefault: isDefault ? 1 : 0
		});
		return Number(result.lastInsertRowid);
	});

	const id = tx();
	const created = getOneStmt.get(id, userEmail) as DbSignatureRow | undefined;
	return rowToSignature(created) as SignatureRow;
}

export function updateSignature(
	userEmail: string,
	id: number,
	patch: { name?: string | null; html?: string | null; isDefault?: boolean | null }
): SignatureRow | null {
	const tx = db.transaction(() => {
		// Promoting this row to default? Strip the flag from any sibling first
		// so the partial-unique index can't fail.
		if (patch.isDefault === true) clearDefaultStmt.run(userEmail);
		updateStmt.run({
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
	return rowToSignature(getOneStmt.get(id, userEmail) as DbSignatureRow | undefined);
}

export function deleteSignature(userEmail: string, id: number): void {
	deleteStmt.run(id, userEmail);
}

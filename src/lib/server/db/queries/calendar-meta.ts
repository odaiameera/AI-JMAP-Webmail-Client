import { getDb } from '../index';

export interface CalendarMetaRow {
	calendarId: string;
	color: string | null;
	hidden: boolean;
}

interface DbCalendarMetaRow {
	calendarId: string;
	color: string | null;
	hidden: number;
}

let _stmts: ReturnType<typeof prepareStmts> | null = null;
function prepareStmts() {
	const db = getDb();
	return {
		getAll: db.prepare(
			`SELECT calendar_id AS calendarId,
			        color,
			        hidden
			 FROM calendar_meta
			 WHERE user_email = ?`
		),
		upsert: db.prepare(
			`INSERT INTO calendar_meta (user_email, calendar_id, color, hidden)
			 VALUES (@userEmail, @calendarId, @color, @hidden)
			 ON CONFLICT (user_email, calendar_id) DO UPDATE SET
			   color      = COALESCE(excluded.color,  calendar_meta.color),
			   hidden     = COALESCE(excluded.hidden, calendar_meta.hidden),
			   updated_at = datetime('now')`
		),
		delete: db.prepare(`DELETE FROM calendar_meta WHERE user_email = ? AND calendar_id = ?`)
	};
}
function stmts() {
	return (_stmts ??= prepareStmts());
}

export function getCalendarMetaForUser(userEmail: string): Map<string, CalendarMetaRow> {
	const rows = stmts().getAll.all(userEmail) as DbCalendarMetaRow[];
	const map = new Map<string, CalendarMetaRow>();
	for (const r of rows) {
		map.set(r.calendarId, { calendarId: r.calendarId, color: r.color, hidden: !!r.hidden });
	}
	return map;
}

export function upsertCalendarMeta(
	userEmail: string,
	calendarId: string,
	patch: { color?: string | null; hidden?: boolean | null }
): void {
	stmts().upsert.run({
		userEmail,
		calendarId,
		color: patch.color ?? null,
		hidden: patch.hidden === undefined || patch.hidden === null ? null : patch.hidden ? 1 : 0
	});
}

export function deleteCalendarMeta(userEmail: string, calendarId: string): void {
	stmts().delete.run(userEmail, calendarId);
}

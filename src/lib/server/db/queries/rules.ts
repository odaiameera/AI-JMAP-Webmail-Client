import { getDb } from '../index';
import type { Rule } from '$lib/types/rules';

let _stmts: ReturnType<typeof prepareStmts> | null = null;
function prepareStmts() {
	const db = getDb();
	return {
		getRules: db.prepare('SELECT rules_json FROM user_rules WHERE user_email = ?'),
		setRules: db.prepare(
			`INSERT INTO user_rules (user_email, rules_json, updated_at)
			 VALUES (@userEmail, @rulesJson, datetime('now'))
			 ON CONFLICT (user_email) DO UPDATE SET
			   rules_json = excluded.rules_json,
			   updated_at = datetime('now')`
		),
		hasRulesRow: db.prepare('SELECT 1 FROM user_rules WHERE user_email = ?'),
		getCursor: db.prepare('SELECT last_run FROM rules_cursor WHERE user_email = ?'),
		setCursor: db.prepare(
			`INSERT INTO rules_cursor (user_email, last_run, updated_at)
			 VALUES (@userEmail, @lastRun, datetime('now'))
			 ON CONFLICT (user_email) DO UPDATE SET
			   last_run = excluded.last_run,
			   updated_at = datetime('now')`
		)
	};
}
function stmts() {
	return (_stmts ??= prepareStmts());
}

export function getRules(userEmail: string): Rule[] {
	const row = stmts().getRules.get(userEmail) as { rules_json: string } | undefined;
	if (!row) return [];
	try {
		const parsed = JSON.parse(row.rules_json);
		return Array.isArray(parsed) ? (parsed as Rule[]) : [];
	} catch {
		return [];
	}
}

export function setRules(userEmail: string, rules: Rule[]): void {
	stmts().setRules.run({ userEmail, rulesJson: JSON.stringify(rules ?? []) });
}

/** True if a rules row exists (even an empty one). Used to gate cookie import. */
export function hasRulesRow(userEmail: string): boolean {
	return !!stmts().hasRulesRow.get(userEmail);
}

/** ISO timestamp the auto-apply worker last processed up to, or null. */
export function getRulesCursor(userEmail: string): string | null {
	const row = stmts().getCursor.get(userEmail) as { last_run: string | null } | undefined;
	return row?.last_run ?? null;
}

export function setRulesCursor(userEmail: string, iso: string): void {
	stmts().setCursor.run({ userEmail, lastRun: iso });
}

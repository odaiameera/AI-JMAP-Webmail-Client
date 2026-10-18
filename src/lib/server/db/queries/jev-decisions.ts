import { getDb } from '../index';
import type { InboxCategory } from '$lib/types/categories';

/**
 * Jev's per-email decisions and the per-month usage counter. See migration
 * 012_jev_sorting.sql for what is (and deliberately isn't) stored.
 */

/** Attempts before an email Jev keeps failing on is given up on. */
export const MAX_JEV_ATTEMPTS = 5;

export interface JevDecisionRow {
	emailId: string;
	status: 'pending' | 'done' | 'failed' | 'skipped';
	attempts: number;
	lastError: string | null;
	category: InboxCategory | null;
	confidence: number | null;
	applied: InboxCategory | null;
	answers: Record<string, unknown> | null;
	facts: Record<string, unknown> | null;
	model: string | null;
	inputTokens: number | null;
	correctedTo: InboxCategory | null;
	/** What Jev said about each rule condition it was asked about. */
	rules: JevRuleCheck[] | null;
	createdAt: number;
	decidedAt: number | null;
}

/** One rule condition Jev was asked about for an email. */
export interface JevRuleCheck {
	ruleId: string;
	ruleName: string;
	statement: string;
	probability: number;
	/** The probability the condition needed, from its strictness. */
	threshold: number;
	negate: boolean;
	/** Whether the rule as a whole fired. */
	fired: boolean;
}

interface RawRow {
	email_id: string;
	status: JevDecisionRow['status'];
	attempts: number;
	last_error: string | null;
	category: string | null;
	confidence: number | null;
	applied: string | null;
	answers_json: string | null;
	facts_json: string | null;
	model: string | null;
	input_tokens: number | null;
	corrected_to: string | null;
	rules_json: string | null;
	created_at: number;
	decided_at: number | null;
}

function parseJson(raw: string | null): Record<string, unknown> | null {
	if (!raw) return null;
	try {
		return JSON.parse(raw) as Record<string, unknown>;
	} catch {
		return null;
	}
}

function parseJsonArray(raw: string): unknown[] | null {
	try {
		const value = JSON.parse(raw);
		return Array.isArray(value) ? value : null;
	} catch {
		return null;
	}
}

function toRow(r: RawRow): JevDecisionRow {
	return {
		emailId: r.email_id,
		status: r.status,
		attempts: r.attempts,
		lastError: r.last_error,
		category: r.category as InboxCategory | null,
		confidence: r.confidence,
		applied: r.applied as InboxCategory | null,
		answers: parseJson(r.answers_json),
		facts: parseJson(r.facts_json),
		model: r.model,
		inputTokens: r.input_tokens,
		correctedTo: r.corrected_to as InboxCategory | null,
		rules: r.rules_json ? (parseJsonArray(r.rules_json) as JevRuleCheck[] | null) : null,
		createdAt: r.created_at,
		decidedAt: r.decided_at
	};
}

let _stmts: ReturnType<typeof prepareStmts> | null = null;

/** Prepared lazily, as in the other query modules (see jev-settings.ts). */
function prepareStmts() {
	const db = getDb();
	return {
		enqueue: db.prepare(
			`INSERT INTO jev_decisions (account_id, email_id, status, created_at)
			 VALUES (?, ?, 'pending', ?)
			 ON CONFLICT (account_id, email_id) DO NOTHING`
		),
		pending: db.prepare(
			`SELECT email_id FROM jev_decisions
			 WHERE account_id = ? AND status = 'pending'
			 ORDER BY created_at, email_id LIMIT ?`
		),
		done: db.prepare(
			`UPDATE jev_decisions SET
			   status = 'done', last_error = NULL, attempts = attempts + 1,
			   category = @category, confidence = @confidence, applied = @applied,
			   answers_json = @answers, facts_json = @facts, rules_json = @rules, model = @model,
			   input_tokens = @inputTokens, decided_at = @now
			 WHERE account_id = @accountId AND email_id = @emailId`
		),
		skip: db.prepare(
			`UPDATE jev_decisions SET status = 'skipped', decided_at = ?
			 WHERE account_id = ? AND email_id = ?`
		),
		fail: db.prepare(
			`UPDATE jev_decisions SET
			   attempts = attempts + 1, last_error = @error,
			   status = CASE WHEN attempts + 1 >= @max THEN 'failed' ELSE 'pending' END,
			   decided_at = CASE WHEN attempts + 1 >= @max THEN @now ELSE decided_at END
			 WHERE account_id = @accountId AND email_id = @emailId`
		),
		get: db.prepare(`SELECT * FROM jev_decisions WHERE account_id = ? AND email_id = ?`),
		correct: db.prepare(
			`UPDATE jev_decisions SET corrected_to = ?
			 WHERE account_id = ? AND email_id = ? AND status = 'done'`
		),
		stats: db.prepare(
			`SELECT COUNT(*) AS sorted,
			        SUM(CASE WHEN corrected_to IS NOT NULL
			                  AND corrected_to IS NOT COALESCE(applied, 'important') THEN 1 ELSE 0 END) AS corrected
			 FROM jev_decisions
			 WHERE account_id = ? AND status = 'done' AND category IS NOT NULL AND decided_at >= ?`
		),
		addUsage: db.prepare(
			`INSERT INTO jev_usage (account_id, month, requests, input_tokens)
			 VALUES (?, ?, 1, ?)
			 ON CONFLICT (account_id, month) DO UPDATE SET
			   requests = requests + 1,
			   input_tokens = input_tokens + excluded.input_tokens`
		),
		usage: db.prepare(
			`SELECT requests, input_tokens FROM jev_usage WHERE account_id = ? AND month = ?`
		)
	};
}
function stmts() {
	return (_stmts ??= prepareStmts());
}

/** Queue newly arrived emails. Emails already known keep their row. */
export function enqueueEmails(accountId: string, emailIds: string[], now = Date.now()): void {
	const s = stmts();
	getDb().transaction(() => {
		for (const id of emailIds) s.enqueue.run(accountId, id, now);
	})();
}

/** Oldest queued emails first. */
export function listPendingEmailIds(accountId: string, limit: number): string[] {
	return (stmts().pending.all(accountId, limit) as { email_id: string }[]).map((r) => r.email_id);
}

export function recordDecision(
	accountId: string,
	emailId: string,
	d: {
		category: InboxCategory | null;
		confidence: number | null;
		applied: InboxCategory | null;
		answers: unknown;
		facts: unknown;
		rules?: JevRuleCheck[];
		/** Null when there was nothing to ask, so Jev wasn't called. */
		model: string | null;
		inputTokens: number;
	},
	now = Date.now()
): void {
	stmts().done.run({
		accountId,
		emailId,
		category: d.category,
		confidence: d.confidence,
		applied: d.applied,
		answers: JSON.stringify(d.answers),
		facts: JSON.stringify(d.facts),
		rules: d.rules?.length ? JSON.stringify(d.rules) : null,
		model: d.model,
		inputTokens: d.inputTokens,
		now
	});
}

/** The email left the Inbox (or vanished) before Jev was asked. */
export function markSkipped(accountId: string, emailId: string, now = Date.now()): void {
	stmts().skip.run(now, accountId, emailId);
}

/** Count a failed attempt; the email is given up on at MAX_JEV_ATTEMPTS. */
export function recordFailure(accountId: string, emailId: string, error: string, now = Date.now()): void {
	stmts().fail.run({ accountId, emailId, error: error.slice(0, 300), max: MAX_JEV_ATTEMPTS, now });
}

export function getDecision(accountId: string, emailId: string): JevDecisionRow | null {
	const row = stmts().get.get(accountId, emailId) as RawRow | undefined;
	return row ? toRow(row) : null;
}

/** You moved emails Jev had sorted: remember where, to measure how often it's wrong. */
export function recordCorrections(accountId: string, emailIds: string[], to: InboxCategory): void {
	const s = stmts();
	getDb().transaction(() => {
		for (const id of emailIds) s.correct.run(to, accountId, id);
	})();
}

/** Emails Jev picked a tab for since `sinceMs`, and how many of those you moved elsewhere. */
export function decisionStats(accountId: string, sinceMs: number): { sorted: number; corrected: number } {
	const row = stmts().stats.get(accountId, sinceMs) as { sorted: number; corrected: number | null };
	return { sorted: row.sorted, corrected: row.corrected ?? 0 };
}

/** Calendar month key in UTC, e.g. `2026-10`. */
export function usageMonth(date = new Date()): string {
	return date.toISOString().slice(0, 7);
}

export function addUsage(accountId: string, inputTokens: number, date = new Date()): void {
	stmts().addUsage.run(accountId, usageMonth(date), inputTokens);
}

export function getUsage(accountId: string, month = usageMonth()): { requests: number; inputTokens: number } {
	const row = stmts().usage.get(accountId, month) as
		| { requests: number; input_tokens: number }
		| undefined;
	return { requests: row?.requests ?? 0, inputTokens: row?.input_tokens ?? 0 };
}

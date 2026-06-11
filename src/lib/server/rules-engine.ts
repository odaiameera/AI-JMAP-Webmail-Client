import type { Email } from '$lib/jmap/types';
import type { Rule, RuleCondition } from '$lib/types/rules';

export interface RuleActionCtx {
	inboxId?: string;
	trashId?: string;
	/**
	 * Live mailbox ids. When provided, label/folder actions whose target no
	 * longer exists are skipped — Stalwart rejects patches referencing dead
	 * mailbox ids and the whole update for that email silently fails.
	 */
	validMailboxIds?: Set<string>;
}

function targetExists(ctx: RuleActionCtx, id: string): boolean {
	return !ctx.validMailboxIds || ctx.validMailboxIds.has(id);
}

/**
 * A condition is usable only if it would actually constrain matching. An
 * empty text value is dropped (same guard the Sieve compiler uses) so a
 * half-finished rule never becomes match-everything.
 */
function isUsableCondition(c: RuleCondition): boolean {
	switch (c.field) {
		case 'from':
		case 'to':
		case 'subject':
		case 'body':
			return c.value.trim().length > 0;
		case 'size':
			return Number.isFinite(parseInt(c.value, 10));
		case 'hasAttachment':
			return true;
		default:
			return false;
	}
}

/** True if any enabled rule needs the message body to evaluate. */
export function rulesNeedBody(rules: Rule[]): boolean {
	return rules.some((r) => r.conditions.some((c) => c.field === 'body' && isUsableCondition(c)));
}

function addressText(addrs: { name: string | null; email: string }[] | null): string {
	if (!addrs) return '';
	return addrs.map((a) => `${a.name ?? ''} ${a.email}`).join(' ');
}

/** Concatenated plain-text body for a fetched email, falling back to preview. */
export function extractBodyText(email: Email): string {
	if (email.bodyValues) {
		const parts = (email.textBody ?? [])
			.map((p) => email.bodyValues?.[p.partId]?.value)
			.filter((v): v is string => !!v);
		if (parts.length) return parts.join(' ');
		const all = Object.values(email.bodyValues)
			.map((v) => v.value)
			.join(' ');
		if (all) return all;
	}
	return email.preview ?? '';
}

function matchesCondition(email: Email, c: RuleCondition, bodyText: string): boolean {
	let res: boolean;

	if (c.field === 'hasAttachment') {
		res = email.hasAttachment === true;
	} else if (c.field === 'size') {
		const kb = parseInt(c.value, 10);
		if (!Number.isFinite(kb)) return false;
		// Mirrors the Sieve `size :over` / JMAP `minSize` semantics.
		res = email.size >= kb * 1024;
	} else {
		let hay: string;
		switch (c.field) {
			case 'from': hay = addressText(email.from); break;
			case 'to': hay = addressText(email.to); break;
			case 'subject': hay = email.subject ?? ''; break;
			case 'body': hay = bodyText; break;
			default: return false;
		}
		hay = hay.toLowerCase();
		const needle = c.value.trim().toLowerCase();
		if (!needle) return false;
		switch (c.op) {
			case 'contains': res = hay.includes(needle); break;
			case 'not_contains': res = !hay.includes(needle); break;
			case 'is': res = hay.trim() === needle; break;
			case 'starts_with': res = hay.startsWith(needle); break;
			case 'ends_with': res = hay.endsWith(needle); break;
			default: res = hay.includes(needle);
		}
	}

	return c.negate ? !res : res;
}

function matchesRule(email: Email, rule: Rule, bodyText: string): boolean {
	const conds = rule.conditions.filter(isUsableCondition);
	if (conds.length === 0) return false; // never match-everything
	const results = conds.map((c) => matchesCondition(email, c, bodyText));
	return rule.logic === 'anyof' ? results.some(Boolean) : results.every(Boolean);
}

/**
 * Semantic result of running rule actions over one email — what to add,
 * remove, and which keywords to flip. Converted to a JMAP update by
 * {@link outcomeToUpdate}; keeping this layer semantic (not raw patches)
 * lets the writer choose a wire format every Stalwart version accepts.
 */
export interface RuleOutcome {
	addMailboxIds: Set<string>;
	removeMailboxIds: Set<string>;
	keywords: Record<string, boolean>;
}

export function emptyOutcome(): RuleOutcome {
	return { addMailboxIds: new Set(), removeMailboxIds: new Set(), keywords: {} };
}

/**
 * Fold one rule's actions into an outcome. Used directly by the manual
 * apply endpoint (which pre-matches emails via Email/query) and via
 * {@link evaluateRulesForEmail} by the scheduler.
 */
export function applyActionsToOutcome(
	email: Email,
	actions: Rule['actions'],
	ctx: RuleActionCtx,
	outcome: RuleOutcome
): { stop: boolean } {
	let stop = false;
	for (const action of actions) {
		switch (action.type) {
			case 'applyLabel':
				if (action.value && targetExists(ctx, action.value)) {
					outcome.addMailboxIds.add(action.value);
				}
				break;
			case 'markRead':
				outcome.keywords['$seen'] = true;
				break;
			case 'markImportant':
				outcome.keywords['$flagged'] = true;
				break;
			case 'moveToFolder':
				if (action.value && targetExists(ctx, action.value)) {
					outcome.addMailboxIds.add(action.value);
					if (ctx.inboxId && action.value !== ctx.inboxId) {
						outcome.removeMailboxIds.add(ctx.inboxId);
					}
				}
				break;
			case 'delete':
				if (ctx.trashId) {
					outcome.addMailboxIds.add(ctx.trashId);
					if (ctx.inboxId) outcome.removeMailboxIds.add(ctx.inboxId);
				}
				break;
			case 'stopProcessing':
				stop = true;
				break;
		}
	}
	return { stop };
}

/**
 * Evaluate the (enabled, ordered) rules against one email. Honors
 * `stopProcessing`. The outcome is idempotent by construction — converting
 * it with {@link outcomeToUpdate} only writes real differences.
 */
export function evaluateRulesForEmail(
	email: Email,
	enabledRules: Rule[],
	ctx: RuleActionCtx,
	bodyText: string
): RuleOutcome {
	const outcome = emptyOutcome();
	for (const rule of enabledRules) {
		if (!matchesRule(email, rule, bodyText)) continue;
		if (applyActionsToOutcome(email, rule.actions, ctx, outcome).stop) break;
	}
	return outcome;
}

/**
 * Turn an outcome into a JMAP Email/set update object.
 *
 * Mailbox membership is written as the **full `mailboxIds` object**, never
 * `mailboxIds/<id>` pointer patches: Stalwart v0.15.0–v0.16.7 (jmap-tools
 * ≤ 0.1.4) tokenizes all-digit pointer segments as array indices and
 * rejects the whole update with "Invalid patch value" — and Stalwart's id
 * alphabet produces all-digit mailbox ids ("9", "92", …) for folders
 * created late enough. This was the root cause of rules reporting success
 * while folders stayed empty. Keywords keep the pointer form: `$`-prefixed
 * names always tokenize as strings, which every version parses correctly.
 *
 * Returns `{}` when the email already satisfies the outcome.
 */
export function outcomeToUpdate(email: Email, outcome: RuleOutcome): Record<string, unknown> {
	const update: Record<string, unknown> = {};

	if (outcome.addMailboxIds.size > 0 || outcome.removeMailboxIds.size > 0) {
		const next: Record<string, boolean> = { ...email.mailboxIds };
		for (const id of outcome.removeMailboxIds) delete next[id];
		for (const id of outcome.addMailboxIds) next[id] = true;
		// JMAP requires ≥1 mailbox — never strand the message.
		if (Object.keys(next).length === 0) Object.assign(next, email.mailboxIds);

		const changed =
			Object.keys(next).length !== Object.keys(email.mailboxIds).length ||
			Object.keys(next).some((k) => !email.mailboxIds[k]);
		if (changed) update.mailboxIds = next;
	}

	for (const [keyword, on] of Object.entries(outcome.keywords)) {
		if (!!email.keywords[keyword] !== on) {
			update[`keywords/${keyword}`] = on;
		}
	}

	return update;
}

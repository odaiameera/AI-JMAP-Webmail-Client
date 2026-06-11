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
 * Evaluate the (enabled, ordered) rules against one email and produce a single
 * JMAP Email/set patch. Actions are idempotent — they only set what isn't
 * already true — so re-running over the same email is harmless. Honors
 * `stopProcessing`.
 */
export function evaluateRulesForEmail(
	email: Email,
	enabledRules: Rule[],
	ctx: RuleActionCtx,
	bodyText: string
): Record<string, unknown> {
	const patch: Record<string, unknown> = {};

	for (const rule of enabledRules) {
		if (!matchesRule(email, rule, bodyText)) continue;

		let stop = false;
		for (const action of rule.actions) {
			switch (action.type) {
				case 'applyLabel':
					if (action.value && targetExists(ctx, action.value) && !email.mailboxIds[action.value]) {
						patch[`mailboxIds/${action.value}`] = true;
					}
					break;
				case 'markRead':
					if (!email.keywords['$seen']) patch['keywords/$seen'] = true;
					break;
				case 'markImportant':
					if (!email.keywords['$flagged']) patch['keywords/$flagged'] = true;
					break;
				case 'moveToFolder':
					if (action.value && targetExists(ctx, action.value)) {
						patch[`mailboxIds/${action.value}`] = true;
						if (ctx.inboxId && email.mailboxIds[ctx.inboxId] && action.value !== ctx.inboxId) {
							patch[`mailboxIds/${ctx.inboxId}`] = null;
						}
					}
					break;
				case 'delete':
					if (ctx.trashId) {
						patch[`mailboxIds/${ctx.trashId}`] = true;
						if (ctx.inboxId && email.mailboxIds[ctx.inboxId]) {
							patch[`mailboxIds/${ctx.inboxId}`] = null;
						}
					}
					break;
				case 'stopProcessing':
					stop = true;
					break;
			}
		}
		if (stop) break;
	}

	return patch;
}

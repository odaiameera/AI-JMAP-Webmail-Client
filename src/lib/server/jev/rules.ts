import { hasJevCondition, jevThreshold, type Rule, type RuleCondition } from '$lib/types/rules';
import { getJevSettings } from '$lib/server/db/queries/jev-settings';
import type { JevRuleCheck } from '$lib/server/db/queries/jev-decisions';
import type { JevConditionAnswers } from '$lib/server/rules-engine';
import { jevMode } from './client';
import type { JevQuestion, JevResponse } from './types';

/**
 * Rule conditions as Jev questions. Each `jev` condition becomes a `noul`
 * question — "how likely is this statement true of the email?" — asked in
 * the same request as the Inbox tab, keyed by the condition's id.
 */

const PREFIX = 'cond:';

export function ruleQuestions(conds: RuleCondition[]): Record<string, JevQuestion> {
	return Object.fromEntries(
		conds.map((c) => [`${PREFIX}${c.id}`, { type: 'noul', instructions: c.value.trim() } satisfies JevQuestion])
	);
}

/** Jev's probabilities for the conditions it was asked about, by condition id. */
export function conditionAnswers(response: JevResponse | null): JevConditionAnswers {
	const out: JevConditionAnswers = new Map();
	for (const [key, answer] of Object.entries(response?.answers ?? {})) {
		if (key.startsWith(PREFIX) && answer?.type === 'noul' && Number.isFinite(answer.noul)) {
			out.set(key.slice(PREFIX.length), answer.noul);
		}
	}
	return out;
}

/** What Jev said about each condition, for the decision record and the "why" chip. */
export function ruleChecks(rules: Rule[], answers: JevConditionAnswers, firedRuleIds: string[]): JevRuleCheck[] {
	const fired = new Set(firedRuleIds);
	const out: JevRuleCheck[] = [];
	for (const rule of rules) {
		for (const c of rule.conditions) {
			const probability = c.field === 'jev' ? answers.get(c.id) : undefined;
			if (probability === undefined) continue;
			out.push({
				ruleId: rule.id,
				ruleName: rule.name,
				statement: c.value.trim(),
				probability,
				threshold: jevThreshold(c),
				negate: c.negate,
				fired: fired.has(rule.id)
			});
		}
	}
	return out;
}

/**
 * Does the Jev worker evaluate this account's rules? Yes when Jev may read
 * its mail, is configured, and an enabled rule has a Jev condition — then
 * every rule runs there, one Jev call per email, and the rules scheduler
 * steps aside so the two never both act on the same message. Anywhere
 * else a Jev condition counts as unknown and its rule doesn't fire.
 */
export function jevHandlesRules(accountRowId: string, enabledRules: Rule[]): boolean {
	return (
		jevMode() !== 'off' &&
		getJevSettings(accountRowId).jevEnabled &&
		enabledRules.some((r) => r.enabled && hasJevCondition(r))
	);
}

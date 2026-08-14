import type { Rule, RuleCondition } from '$lib/types/rules';

export type JmapFilter = Record<string, unknown>;

/**
 * Translate a single rule condition to a JMAP Email/query filter.
 *
 * JMAP natively supports `contains`-style matching on `from`, `to`, `subject`,
 * `body`, plus `minSize` and `hasAttachment`. The operators `is`,
 * `starts_with`, `ends_with` don't have a direct equivalent — we fall back
 * to `contains` so the preview count stays in the right ballpark. Sieve
 * still enforces exact-match semantics at delivery time.
 */
function conditionToFilter(c: RuleCondition): JmapFilter | null {
	let base: JmapFilter | null = null;

	switch (c.field) {
		case 'from':    base = c.value ? { from: c.value } : null; break;
		case 'to':      base = c.value ? { to: c.value } : null; break;
		case 'subject': base = c.value ? { subject: c.value } : null; break;
		case 'body':    base = c.value ? { body: c.value } : null; break;
		case 'size': {
			const kb = parseInt(c.value, 10);
			if (!Number.isFinite(kb)) return null;
			base = { minSize: kb * 1024 };
			break;
		}
		case 'hasAttachment':
			base = { hasAttachment: true };
			break;
	}

	if (!base) return null;

	const negated = c.negate || c.op === 'not_contains';
	return negated ? { operator: 'NOT', conditions: [base] } : base;
}

/**
 * Build a combined JMAP filter for a rule's conditions, respecting its
 * `allof` / `anyof` logic. Returns `null` when the rule has no usable
 * conditions (e.g. empty value on a text field).
 */
export function buildJmapFilter(rule: Rule): JmapFilter | null {
	const filters = rule.conditions
		.map(conditionToFilter)
		.filter((f): f is JmapFilter => f !== null);

	if (filters.length === 0) return null;
	if (filters.length === 1) return filters[0];

	return {
		operator: rule.logic === 'allof' ? 'AND' : 'OR',
		conditions: filters
	};
}

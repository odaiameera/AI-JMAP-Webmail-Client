import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDecision } from '$lib/server/db/queries/jev-decisions';
import { recordRuleFeedback } from '$lib/server/db/queries/jev-learning';

/**
 * "This rule shouldn't have fired" on one email. Only for a rule that Jev's
 * answers actually made fire on that email, so the miss counts in the rules
 * editor stay set against real hits.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.auth || !locals.activeAccountId) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}
	const body = (await request.json().catch(() => ({}))) as { emailId?: unknown; ruleId?: unknown };
	const emailId = typeof body.emailId === 'string' ? body.emailId : '';
	const ruleId = typeof body.ruleId === 'string' ? body.ruleId : '';

	const fired = getDecision(locals.activeAccountId, emailId)?.rules?.some((r) => r.ruleId === ruleId && r.fired);
	if (!fired) return json({ error: 'That rule didn’t fire on this email' }, { status: 400 });

	recordRuleFeedback(locals.activeAccountId, ruleId, emailId);
	return json({ success: true });
};

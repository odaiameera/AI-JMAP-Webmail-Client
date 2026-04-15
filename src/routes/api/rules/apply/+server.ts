import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '$lib/jmap/auth';
import { getMailboxes } from '$lib/jmap/mailbox';
import type { Rule, RuleCondition } from '$lib/types/rules';
import type { Email, Mailbox } from '$lib/jmap/types';

function matchCondition(c: RuleCondition, email: Email): boolean {
	let fieldValue = '';

	switch (c.field) {
		case 'from':
			fieldValue = email.from?.map(a => `${a.name ?? ''} ${a.email}`).join(' ') ?? '';
			break;
		case 'to':
			fieldValue = [
				...(email.to ?? []),
				...(email.cc ?? [])
			].map(a => `${a.name ?? ''} ${a.email}`).join(' ');
			break;
		case 'subject':
			fieldValue = email.subject ?? '';
			break;
		case 'size':
			return email.size > parseInt(c.value) * 1024;
		case 'hasAttachment':
			return email.hasAttachment;
		case 'body':
			return false;
	}

	const val = c.value.toLowerCase();
	const fv = fieldValue.toLowerCase();

	let result: boolean;
	switch (c.op) {
		case 'contains':     result = fv.includes(val); break;
		case 'not_contains': result = !fv.includes(val); break;
		case 'is':           result = fv === val; break;
		case 'starts_with':  result = fv.startsWith(val); break;
		case 'ends_with':    result = fv.endsWith(val); break;
		default:             result = fv.includes(val);
	}

	return c.negate ? !result : result;
}

function matchRule(rule: Rule, email: Email): boolean {
	if (!rule.enabled || rule.conditions.length === 0) return false;

	if (rule.logic === 'allof') {
		return rule.conditions.every(c => matchCondition(c, email));
	} else {
		return rule.conditions.some(c => matchCondition(c, email));
	}
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.auth) return json({ error: 'Not authenticated' }, { status: 401 });

	const { rules } = await request.json() as { rules: Rule[] };
	const activeRules = rules.filter(r => r.enabled);

	if (activeRules.length === 0) {
		return json({ applied: 0, matched: 0 });
	}

	const client = createClient(locals.auth);
	const { accountId } = locals.auth;

	const mailboxes = await getMailboxes(client, accountId);
	const mailboxByName = new Map<string, Mailbox>();
	for (const mb of mailboxes) {
		mailboxByName.set(mb.name, mb);
	}

	// Paginate to get ALL emails across all mailboxes
	const allEmails: Email[] = [];
	let position = 0;
	const PAGE_SIZE = 200;

	while (true) {
		const response = await client.request([
			['Email/query', {
				accountId,
				sort: [{ property: 'receivedAt', isAscending: false }],
				position,
				limit: PAGE_SIZE
			}, 'q'],
			['Email/get', {
				accountId,
				'#ids': { resultOf: 'q', name: 'Email/query', path: '/ids' },
				properties: ['id', 'from', 'to', 'cc', 'subject', 'size', 'keywords', 'hasAttachment', 'mailboxIds']
			}, 'g']
		]);

		const emails = (response.methodResponses[1][1] as { list: Email[] }).list;
		allEmails.push(...emails);

		if (emails.length < PAGE_SIZE) break;
		position += PAGE_SIZE;

		// Safety cap at 2000 emails
		if (allEmails.length >= 2000) break;
	}

	// Evaluate rules against each email
	const updates: Record<string, Record<string, unknown>> = {};
	let matchCount = 0;

	for (const email of allEmails) {
		for (const rule of activeRules) {
			if (!matchRule(rule, email)) continue;
			matchCount++;

			if (!updates[email.id]) updates[email.id] = {};

			for (const action of rule.actions) {
				switch (action.type) {
					case 'applyLabel':
						if (action.value && !email.keywords[action.value]) {
							updates[email.id][`keywords/${action.value}`] = true;
						}
						break;
					case 'markRead':
						if (!email.keywords['$seen']) {
							updates[email.id]['keywords/$seen'] = true;
						}
						break;
					case 'markImportant':
						if (!email.keywords['$flagged']) {
							updates[email.id]['keywords/$flagged'] = true;
						}
						break;
					case 'moveToFolder': {
						const targetMb = mailboxByName.get(action.value ?? '');
						if (targetMb) {
							updates[email.id]['mailboxIds'] = { [targetMb.id]: true };
						}
						break;
					}
					case 'delete': {
						const trash = mailboxes.find(m => m.role === 'trash');
						if (trash) {
							updates[email.id]['mailboxIds'] = { [trash.id]: true };
						}
						break;
					}
					case 'stopProcessing':
						break;
				}
			}

			if (rule.actions.some(a => a.type === 'stopProcessing')) break;
		}
	}

	// Filter out emails with no actual changes
	const emailsToUpdate = Object.entries(updates).filter(([, u]) => Object.keys(u).length > 0);

	if (emailsToUpdate.length === 0) {
		return json({ applied: 0, matched: matchCount });
	}

	// Batch update in chunks of 50
	const BATCH_SIZE = 50;
	let applied = 0;

	for (let i = 0; i < emailsToUpdate.length; i += BATCH_SIZE) {
		const batch = emailsToUpdate.slice(i, i + BATCH_SIZE);
		const updateObj: Record<string, Record<string, unknown>> = {};
		for (const [id, changes] of batch) {
			updateObj[id] = changes;
		}

		await client.request([
			['Email/set', { accountId, update: updateObj }, '0']
		]);
		applied += batch.length;
	}

	return json({ applied, matched: matchCount });
};

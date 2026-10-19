import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient, fetchSession } from '$lib/jmap/auth';
import { getMailboxes } from '$lib/jmap/mailbox';
import { isUsableCondition, type Rule } from '$lib/types/rules';
import { conditionValue, extractBodyText } from '$lib/server/rules-engine';
import { exactPartFilter } from '$lib/server/rules';
import { costUsd, jevMode } from '$lib/server/jev/client';
import { conditionAnswers, ruleQuestions } from '$lib/server/jev/rules';
import { fetchEmailsForJev, judgeEmails } from '$lib/server/jev/worker';

/** Newest Inbox emails a test judges. */
const TEST_LIMIT = 100;
const FETCH_CHUNK = 50;

/**
 * Test a rule with a Jev condition on recent mail, changing nothing: the
 * newest Inbox emails that pass its exact conditions, each with every
 * condition's raw value — true/false for exact ones, Jev's probability for
 * Jev ones. The editor decides matches from those with the same logic as
 * the engine, so moving a condition's strictness re-sorts the list without
 * asking Jev again. Pressing Test is the consent to send these emails.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.auth || !locals.activeAccountId) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}
	if (jevMode() === 'off') {
		return json({ error: 'Jev isn’t configured on this server' }, { status: 409 });
	}
	const account = locals.accounts?.find((a) => a.id === locals.activeAccountId);
	if (!account) return json({ error: 'Unknown account' }, { status: 404 });

	const { rule } = (await request.json().catch(() => ({}))) as { rule?: Rule };
	const conds = (rule?.conditions ?? []).filter(isUsableCondition);
	const jevConds = conds.filter((c) => c.field === 'jev');
	if (!rule || jevConds.length === 0) {
		return json({ error: 'This rule has no Jev condition to test' }, { status: 400 });
	}

	const client = createClient(locals.auth);
	const { accountId } = locals.auth;
	const mailboxes = await getMailboxes(client, accountId);
	const inbox = mailboxes.find((m) => m.role === 'inbox');
	if (!inbox) return json({ error: 'No Inbox on this account' }, { status: 404 });

	const exact = exactPartFilter(rule);
	const query = await client.request([
		[
			'Email/query',
			{
				accountId,
				filter: exact ? { operator: 'AND', conditions: [{ inMailbox: inbox.id }, exact] } : { inMailbox: inbox.id },
				sort: [{ property: 'receivedAt', isAscending: false }],
				limit: TEST_LIMIT
			},
			'q'
		]
	]);
	const ids = (query.methodResponses[0][1] as { ids?: string[] }).ids ?? [];
	const emails = [];
	for (let i = 0; i < ids.length; i += FETCH_CHUNK) {
		emails.push(...(await fetchEmailsForJev(client, accountId, ids.slice(i, i + FETCH_CHUNK))));
	}

	const questions = ruleQuestions(jevConds);
	const judged = await judgeEmails(
		client,
		accountId,
		emails,
		{
			accountRowId: account.id,
			accountEmail: account.email,
			sentId: mailboxes.find((m) => m.role === 'sent')?.id ?? null,
			session: await fetchSession(locals.auth).catch(() => null)
		},
		() => questions
	);

	let inputTokens = 0;
	const rows = judged.map((j) => {
		inputTokens += j.response?.usage.inputTokens ?? 0;
		const answers = conditionAnswers(j.response);
		const body = extractBodyText(j.email);
		const values: Record<string, boolean | number | null> = {};
		for (const c of conds) values[c.id] = conditionValue(j.email, c, body, answers) ?? null;
		const sender = j.email.from?.[0];
		return {
			id: j.email.id,
			from: sender?.name || sender?.email || '(unknown sender)',
			subject: j.email.subject || '(no subject)',
			receivedAt: j.email.receivedAt,
			values,
			error: j.error
		};
	});

	const mock = judged.some((j) => j.response?.mock);
	return json({
		total: rows.length,
		narrowed: !!exact,
		inputTokens,
		costUsd: mock ? 0 : costUsd(inputTokens),
		mock,
		rows
	});
};

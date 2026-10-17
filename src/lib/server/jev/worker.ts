import cron from 'node-cron';
import { listSchedulableAuths, markNeedsReauth } from '$lib/server/auth/accounts';
import { JMAPAuthError, type JMAPClient } from '$lib/jmap/client';
import { createClient, fetchSession } from '$lib/jmap/auth';
import { EmailUpdateError, setEmailCategory } from '$lib/jmap/email';
import { getMailboxes } from '$lib/jmap/mailbox';
import type { AuthState, Email, JMAPSession } from '$lib/jmap/types';
import { categoryOf, type InboxCategory } from '$lib/types/categories';
import {
	getJevSettings,
	sortingEnabled,
	updateJevSettings
} from '$lib/server/db/queries/jev-settings';
import {
	addUsage,
	enqueueEmails,
	listPendingEmailIds,
	markSkipped,
	recordDecision,
	recordFailure
} from '$lib/server/db/queries/jev-decisions';
import { askJev, jevMode } from './client';
import {
	CATEGORY_QUESTION,
	CATEGORY_QUESTION_ID,
	decideCategory,
	type CategoryDecision
} from './categorize';
import { buildEmailState, type JevFacts } from './email-state';
import { gatherFacts } from './facts';
import type { JevResponse } from './types';

/**
 * Jev sorting new Inbox mail into tabs, a beat after it lands — the same
 * shape as the rules scheduler: every minute, plus a catch-up for whoever
 * is using the app. Only accounts with both Inbox tabs and Jev sorting on
 * are touched, and only mail that arrived after sorting was switched on.
 *
 * Arrivals are queued in jev_decisions first and judged from the queue, so
 * an email whose call fails is retried on the next run (up to
 * MAX_JEV_ATTEMPTS) while the cursor keeps moving for everything else.
 */

/** New arrivals queued per run. */
const QUEUE_PAGE = 100;
/** Queued emails judged per run. */
const JUDGE_BATCH = 25;
/** Parallel calls to TypeSafe per account. */
const CONCURRENCY = 4;
/** How many of the newest Inbox emails "Try Jev" judges. */
export const PREVIEW_LIMIT = 200;
/** Body bytes fetched per email — comfortably more than the excerpt needs. */
const MAX_BODY_BYTES = 16_000;

const JEV_EMAIL_PROPERTIES = [
	'id', 'threadId', 'mailboxIds', 'keywords',
	'from', 'to', 'cc', 'subject', 'receivedAt', 'preview',
	'textBody', 'htmlBody', 'bodyValues',
	'header:list-unsubscribe:asText',
	'header:list-id:asText',
	'header:precedence:asText',
	'header:auto-submitted:asText'
];

/** Fetch emails with everything the state and facts are built from. */
export async function fetchEmailsForJev(
	client: JMAPClient,
	accountId: string,
	ids: string[]
): Promise<Email[]> {
	if (ids.length === 0) return [];
	const response = await client.request([
		[
			'Email/get',
			{
				accountId,
				ids,
				properties: JEV_EMAIL_PROPERTIES,
				fetchTextBodyValues: true,
				fetchHTMLBodyValues: true,
				maxBodyValueBytes: MAX_BODY_BYTES
			},
			'g'
		]
	]);
	return (response.methodResponses[0][1] as { list?: Email[] }).list ?? [];
}

/** Run `fn` over `items`, at most `limit` at a time, keeping order. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
	const out: R[] = new Array(items.length);
	let next = 0;
	async function lane() {
		while (next < items.length) {
			const i = next++;
			out[i] = await fn(items[i]);
		}
	}
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
	return out;
}

export interface JudgedEmail {
	email: Email;
	facts: JevFacts;
	response: JevResponse | null;
	decision: CategoryDecision | null;
	error: string | null;
}

export interface JudgeContext {
	/** The linked account row — usage is counted against it. */
	accountRowId: string;
	accountEmail: string;
	sentId: string | null;
	session: JMAPSession | null;
}

/**
 * Ask Jev which tab each email belongs in. Shared by the worker and the
 * preview; a failed call becomes `error` on that email, never a throw.
 */
export async function judgeEmails(
	client: JMAPClient,
	accountId: string,
	emails: Email[],
	ctx: JudgeContext
): Promise<JudgedEmail[]> {
	const facts = await gatherFacts(client, accountId, emails, ctx);
	return mapPool(emails, CONCURRENCY, async (email): Promise<JudgedEmail> => {
		const emailFacts = facts.get(email.id)!;
		try {
			const response = await askJev(buildEmailState(email, emailFacts), {
				[CATEGORY_QUESTION_ID]: CATEGORY_QUESTION
			});
			if (!response.mock) addUsage(ctx.accountRowId, response.usage.inputTokens);
			return {
				email,
				facts: emailFacts,
				response,
				decision: decideCategory(response.answers[CATEGORY_QUESTION_ID]),
				error: null
			};
		} catch (err) {
			return {
				email,
				facts: emailFacts,
				response: null,
				decision: null,
				error: err instanceof Error ? err.message : String(err)
			};
		}
	});
}

/**
 * The tab to put a judged email in, or null to leave it. Jev never
 * overrules a tab the message already has — you, or a rule, moved it there
 * first — and only a confident pick is used.
 */
export function tabToApply(judged: JudgedEmail): InboxCategory | null {
	if (!judged.decision?.apply) return null;
	if (categoryOf(judged.email.keywords) !== 'important') return null;
	return judged.decision.apply;
}

/** One sorting pass for one account. */
export async function sortNewMail(
	accountRowId: string,
	accountEmail: string,
	auth: AuthState,
	now = new Date()
): Promise<void> {
	const settings = getJevSettings(accountRowId);
	if (!sortingEnabled(settings) || jevMode() === 'off') return;
	if (!settings.sortCursor) {
		updateJevSettings(accountRowId, { sortCursor: now.toISOString() }, now);
		return;
	}

	const client = createClient(auth);
	const { accountId } = auth;
	const mailboxes = await getMailboxes(client, accountId);
	const inbox = mailboxes.find((m) => m.role === 'inbox');
	if (!inbox) return;
	const sentId = mailboxes.find((m) => m.role === 'sent')?.id ?? null;

	// 1. Queue what arrived since the cursor.
	const arrivals = await client.request([
		[
			'Email/query',
			{
				accountId,
				filter: { operator: 'AND', conditions: [{ inMailbox: inbox.id }, { after: settings.sortCursor }] },
				sort: [{ property: 'receivedAt', isAscending: true }],
				limit: QUEUE_PAGE
			},
			'q'
		],
		[
			'Email/get',
			{
				accountId,
				'#ids': { resultOf: 'q', name: 'Email/query', path: '/ids' },
				properties: ['id', 'receivedAt']
			},
			'g'
		]
	]);
	const arrived = (arrivals.methodResponses[1][1] as { list?: { id: string; receivedAt: string }[] }).list ?? [];
	enqueueEmails(accountRowId, arrived.map((e) => e.id), now.getTime());
	// A full page may have more behind it: resume from the last one seen.
	const nextCursor = arrived.length >= QUEUE_PAGE ? arrived[arrived.length - 1].receivedAt : now.toISOString();
	updateJevSettings(accountRowId, { sortCursor: nextCursor }, now);

	// 2. Judge what's queued — new arrivals and earlier failures alike.
	const ids = listPendingEmailIds(accountRowId, JUDGE_BATCH);
	if (ids.length === 0) return;
	const fetched = new Map((await fetchEmailsForJev(client, accountId, ids)).map((e) => [e.id, e]));
	const inInbox: Email[] = [];
	for (const id of ids) {
		const email = fetched.get(id);
		if (email?.mailboxIds[inbox.id]) inInbox.push(email);
		else markSkipped(accountRowId, id, now.getTime());
	}
	if (inInbox.length === 0) return;

	const session = await fetchSession(auth).catch(() => null);
	const judged = await judgeEmails(client, accountId, inInbox, {
		accountRowId,
		accountEmail,
		sentId,
		session
	});

	// 3. Apply, one write per tab. Important needs no write: new mail is
	// already there. Each tab is worked out once, before anything changes.
	const tabs = new Map(judged.map((j) => [j.email.id, j.response ? tabToApply(j) : null]));
	const byTab = new Map<InboxCategory, string[]>();
	for (const [id, tab] of tabs) {
		if (tab && tab !== 'important') byTab.set(tab, [...(byTab.get(tab) ?? []), id]);
	}
	const writeFailed = new Set<string>();
	for (const [tab, tabIds] of byTab) {
		try {
			await setEmailCategory(client, accountId, tabIds, tab);
		} catch (err) {
			if (err instanceof JMAPAuthError) throw err;
			const failed = err instanceof EmailUpdateError ? err.failures.map((f) => f.id) : tabIds;
			for (const id of failed) writeFailed.add(id);
		}
	}

	// 4. Record. A failed call or write is retried next run.
	for (const j of judged) {
		if (!j.response) {
			recordFailure(accountRowId, j.email.id, j.error ?? 'No answer', now.getTime());
		} else if (writeFailed.has(j.email.id)) {
			recordFailure(accountRowId, j.email.id, 'The mail server refused the tab change', now.getTime());
		} else {
			recordDecision(
				accountRowId,
				j.email.id,
				{
					category: j.decision?.category ?? null,
					confidence: j.decision?.confidence ?? null,
					applied: tabs.get(j.email.id) ?? null,
					answers: j.response.answers,
					facts: j.facts,
					model: j.response.model,
					inputTokens: j.response.usage.inputTokens
				},
				now.getTime()
			);
		}
	}
}

let started = false;
const inFlight = new Set<string>();

/** One account's pass, never throwing; overlapping passes are skipped. */
export async function sortNewMailSafe(
	accountRowId: string,
	accountEmail: string,
	auth: AuthState
): Promise<void> {
	if (inFlight.has(accountRowId)) return;
	inFlight.add(accountRowId);
	try {
		await sortNewMail(accountRowId, accountEmail, auth);
	} catch (err) {
		if (err instanceof JMAPAuthError) markNeedsReauth(accountRowId);
		else console.error('[jev] sorting failed', accountEmail, err);
	} finally {
		inFlight.delete(accountRowId);
	}
}

export function startJevScheduler(): void {
	if (started) return;
	started = true;
	cron.schedule('* * * * *', async () => {
		for (const { account, auth } of listSchedulableAuths()) {
			await sortNewMailSafe(account.id, account.email, auth);
		}
	});
}

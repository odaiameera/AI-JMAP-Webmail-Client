import type { JMAPClient } from './client';
import type {
	ComposeAttachment,
	ComposeEmail,
	Email,
	EmailAddress,
	EmailQueryResult,
	JMAPResponse
} from './types';

const LIST_PROPERTIES = [
	'id', 'blobId', 'threadId', 'mailboxIds',
	'from', 'to', 'cc', 'subject',
	'receivedAt', 'size', 'preview',
	'keywords', 'hasAttachment'
];

export async function queryAndFetchEmails(
	client: JMAPClient,
	accountId: string,
	mailboxId: string,
	options: { position?: number; limit?: number; extraFilter?: Record<string, unknown> | null } = {}
): Promise<EmailQueryResult> {
	const { position = 0, limit = 50, extraFilter = null } = options;

	// AND the quick-filter condition (if any) with the mailbox constraint.
	const filter = extraFilter
		? { operator: 'AND', conditions: [{ inMailbox: mailboxId }, extraFilter] }
		: { inMailbox: mailboxId };

	const response = await client.request([
		[
			'Email/query',
			{
				accountId,
				filter,
				sort: [{ property: 'receivedAt', isAscending: false }],
				position,
				limit,
				calculateTotal: true
			},
			'q'
		],
		[
			'Email/get',
			{
				accountId,
				'#ids': { resultOf: 'q', name: 'Email/query', path: '/ids' },
				properties: LIST_PROPERTIES
			},
			'g'
		]
	]);

	const queryResult = response.methodResponses[0][1] as { total: number };
	const getResult = response.methodResponses[1][1] as { list: Email[] };

	return {
		emails: getResult.list,
		total: queryResult.total
	};
}

export async function getEmailDetail(
	client: JMAPClient,
	accountId: string,
	id: string
): Promise<Email> {
	const response = await client.request([
		[
			'Email/get',
			{
				accountId,
				ids: [id],
				properties: [
					...LIST_PROPERTIES,
					'htmlBody', 'textBody', 'bodyValues', 'attachments',
					'header:list-unsubscribe:asText',
					'header:list-unsubscribe-post:asText',
					'header:x-spam-status:asText',
					'header:x-spam-score:asText'
				],
				fetchAllBodyValues: true
			},
			'0'
		]
	]);

	const result = response.methodResponses[0][1] as { list: Email[] };

	if (!result.list.length) {
		throw new Error('Email not found');
	}

	return result.list[0];
}

function buildEmailCreate(compose: ComposeEmail): Record<string, unknown> {
	const emailCreate: Record<string, unknown> = {
		from: [compose.from],
		to: compose.to,
		subject: compose.subject,
		bodyValues: {
			body: { value: compose.body, charset: 'utf-8' }
		},
		keywords: { $draft: true }
	};

	if (compose.cc.length > 0) {
		emailCreate.cc = compose.cc;
	}
	if (compose.bcc && compose.bcc.length > 0) {
		emailCreate.bcc = compose.bcc;
	}

	emailCreate.htmlBody = [{ partId: 'body', type: 'text/html' }];

	if (compose.attachments && compose.attachments.length > 0) {
		emailCreate.attachments = compose.attachments.map((a: ComposeAttachment) => ({
			blobId: a.blobId,
			type: a.type,
			name: a.name,
			size: a.size,
			disposition: 'attachment'
		}));
	}

	if (compose.inReplyTo) {
		emailCreate.inReplyTo = [compose.inReplyTo];
	}
	if (compose.references) {
		emailCreate.references = compose.references.split(' ').filter(Boolean);
	}

	return emailCreate;
}

export async function sendEmail(
	client: JMAPClient,
	accountId: string,
	compose: ComposeEmail,
	sentMailboxId: string,
	identity: { id: string; email: string }
): Promise<{ success: boolean; error?: string }> {
	// Step 1: Create the email in Sent. We no longer fetch Identity/get
	// here — the API endpoint resolves the user's chosen identity from
	// the SQLite cache and passes it in. That cache is refreshed by the
	// (app) layout on every navigation.
	const emailCreate = buildEmailCreate(compose);
	emailCreate.mailboxIds = { [sentMailboxId]: true };
	emailCreate.keywords = { '$seen': true };

	const createResponse = await client.request([
		[
			'Email/set',
			{
				accountId,
				create: { draft1: emailCreate }
			},
			'0'
		]
	]);

	const emailSetResult = createResponse.methodResponses[0][1] as {
		created?: Record<string, { id: string }>;
		notCreated?: Record<string, { type: string; description?: string }>;
	};

	if (emailSetResult.notCreated) {
		const err = Object.values(emailSetResult.notCreated)[0];
		return { success: false, error: err?.description ?? err?.type ?? 'Failed to create email' };
	}

	const emailId = emailSetResult.created?.draft1?.id;
	if (!emailId) {
		return { success: false, error: 'Email created but no ID returned' };
	}

	// Step 2: Submit the email — use identity email for mailFrom envelope.
	// Bcc recipients are included in the envelope so they receive the message,
	// but the `bcc` header was already stripped by the server on the stored copy.
	const allRecipients: EmailAddress[] = [...compose.to, ...compose.cc, ...(compose.bcc ?? [])];

	const submitResponse = await client.request([
		[
			'EmailSubmission/set',
			{
				accountId,
				create: {
					sub1: {
						emailId,
						identityId: identity.id,
						envelope: {
							mailFrom: { email: identity.email },
							rcptTo: allRecipients.map((a) => ({ email: a.email }))
						}
					}
				}
			},
			'0'
		]
	]);

	const submissionResult = submitResponse.methodResponses[0][1] as {
		created?: Record<string, unknown>;
		notCreated?: Record<string, { type: string; description?: string }>;
	};

	if (submissionResult.notCreated) {
		const err = Object.values(submissionResult.notCreated)[0];
		return { success: false, error: err?.description ?? err?.type ?? 'Failed to send email' };
	}

	return { success: true };
}

export async function saveDraft(
	client: JMAPClient,
	accountId: string,
	draftsMailboxId: string,
	compose: ComposeEmail
): Promise<{ success: boolean; id?: string; error?: string }> {
	const emailCreate = buildEmailCreate(compose);
	emailCreate.mailboxIds = { [draftsMailboxId]: true };

	const response = await client.request([
		[
			'Email/set',
			{
				accountId,
				create: { draft1: emailCreate }
			},
			'0'
		]
	]);

	const result = response.methodResponses[0][1] as {
		created?: Record<string, { id: string }>;
		notCreated?: Record<string, { type: string; description?: string }>;
	};

	if (result.notCreated) {
		const err = Object.values(result.notCreated)[0];
		return { success: false, error: err?.description ?? err?.type ?? 'Failed to save draft' };
	}

	const created = result.created?.draft1;
	return { success: true, id: created?.id };
}

export async function destroyEmail(
	client: JMAPClient,
	accountId: string,
	id: string
): Promise<void> {
	await client.request([
		['Email/set', { accountId, destroy: [id] }, '0']
	]);
}

export async function markEmail(
	client: JMAPClient,
	accountId: string,
	id: string,
	read: boolean
): Promise<void> {
	const response = await client.request([
		[
			'Email/set',
			{
				accountId,
				update: {
					[id]: {
						// `false` (not null) — accepted by every Stalwart version;
						// keyword pointer segments are never digit-only so the
						// patch form is safe here (see updateEmailMailboxes).
						'keywords/$seen': read ? true : false
					}
				}
			},
			'0'
		]
	]);
	assertAllUpdated(response, [id]);
}

// ---------------------------------------------------------------------------
// Mailbox membership writes
// ---------------------------------------------------------------------------

/**
 * Mailbox/keyword changes for one email, applied via
 * {@link updateEmailMailboxes}.
 */
export interface EmailMailboxChange {
	/** Mailbox ids to add. */
	add?: string[];
	/** Mailbox ids to remove. */
	remove?: string[];
	/** Keyword → set (true) / clear (false). */
	keywords?: Record<string, boolean>;
}

export interface EmailUpdateFailure {
	id: string;
	type: string;
	description: string;
	properties?: string[];
}

export class EmailUpdateError extends Error {
	constructor(
		message: string,
		public failures: EmailUpdateFailure[]
	) {
		super(message);
		this.name = 'EmailUpdateError';
	}
}

interface EmailSetResult {
	updated?: Record<string, unknown> | null;
	notUpdated?: Record<
		string,
		{ type?: string; description?: string; properties?: string[] }
	> | null;
}

function collectSetFailures(result: EmailSetResult): EmailUpdateFailure[] {
	return Object.entries(result.notUpdated ?? {}).map(([id, err]) => ({
		id,
		type: err.type ?? 'serverFail',
		description: err.description ?? 'rejected by server',
		properties: err.properties
	}));
}

function failureMessage(failures: EmailUpdateFailure[]): string {
	const first = failures[0];
	const where = first.properties?.length ? ` (${first.properties.join(', ')})` : '';
	return `${failures.length} update${failures.length === 1 ? '' : 's'} rejected: ${first.description}${where}`;
}

function assertAllUpdated(response: JMAPResponse, ids: string[]): void {
	const result = response.methodResponses[0][1] as EmailSetResult;
	const failures = collectSetFailures(result);
	if (failures.length > 0) {
		throw new EmailUpdateError(failureMessage(failures), failures);
	}
	void ids;
}

/**
 * Change which mailboxes emails live in by rewriting the **full**
 * `mailboxIds` object, never `mailboxIds/<id>` JSON-pointer patches.
 *
 * Why: Stalwart's JMAP pointer tokenizer (jmap-tools ≤ 0.1.4, shipped in
 * Stalwart v0.15.0–v0.16.7) parses an all-digit pointer segment as an
 * array index, and `handle_email_patch` has no arm for it — the update is
 * rejected with "Invalid patch value". Stalwart's id alphabet
 * ("abcdefghijklmnopqrstuvwxyz792013") routinely yields all-digit mailbox
 * ids (e.g. "9", "92"), so any folder created late enough is unaddressable
 * via patches on those versions. Full-object writes parse map keys with
 * property context on every version, so they always work. Keyword patches
 * keep the pointer form — `$`-prefixed names never tokenize as numbers.
 *
 * Costs one extra Email/get round trip to learn current membership; the
 * read-modify-write race window is negligible for a personal mailbox.
 * Server-side rejections are surfaced as {@link EmailUpdateError} instead
 * of being silently dropped.
 */
export async function updateEmailMailboxes(
	client: JMAPClient,
	accountId: string,
	changes: Record<string, EmailMailboxChange>
): Promise<void> {
	const ids = Object.keys(changes);
	if (ids.length === 0) return;

	const getResponse = await client.request([
		['Email/get', { accountId, ids, properties: ['id', 'mailboxIds'] }, '0']
	]);
	const list =
		((getResponse.methodResponses[0][1] as { list?: { id: string; mailboxIds?: Record<string, boolean> }[] })
			.list ?? []);
	const current = new Map(list.map((e) => [e.id, e.mailboxIds ?? {}]));

	const failures: EmailUpdateFailure[] = [];
	const update: Record<string, Record<string, unknown>> = {};

	for (const id of ids) {
		const cur = current.get(id);
		if (!cur) {
			failures.push({ id, type: 'notFound', description: 'Email no longer exists' });
			continue;
		}
		const change = changes[id];
		const patch: Record<string, unknown> = {};

		if (change.add?.length || change.remove?.length) {
			const next: Record<string, boolean> = { ...cur };
			for (const mb of change.remove ?? []) delete next[mb];
			for (const mb of change.add ?? []) next[mb] = true;
			// JMAP requires at least one mailbox — never strand a message.
			if (Object.keys(next).length === 0) Object.assign(next, cur);

			const changed =
				Object.keys(next).length !== Object.keys(cur).length ||
				Object.keys(next).some((k) => !cur[k]);
			if (changed) patch.mailboxIds = next;
		}

		for (const [keyword, on] of Object.entries(change.keywords ?? {})) {
			patch[`keywords/${keyword}`] = on;
		}

		if (Object.keys(patch).length > 0) update[id] = patch;
	}

	if (Object.keys(update).length > 0) {
		const setResponse = await client.request([
			['Email/set', { accountId, update }, '0']
		]);
		failures.push(...collectSetFailures(setResponse.methodResponses[0][1] as EmailSetResult));
	}

	if (failures.length > 0) {
		throw new EmailUpdateError(failureMessage(failures), failures);
	}
}

export async function moveEmail(
	client: JMAPClient,
	accountId: string,
	id: string,
	targetMailboxId: string,
	sourceMailboxId?: string
): Promise<void> {
	await updateEmailMailboxes(client, accountId, {
		[id]: {
			add: [targetMailboxId],
			remove:
				sourceMailboxId && sourceMailboxId !== targetMailboxId ? [sourceMailboxId] : []
		}
	});
}

/**
 * Move a batch of emails: one Email/get + one Email/set regardless of
 * batch size.
 */
export async function moveEmails(
	client: JMAPClient,
	accountId: string,
	ids: string[],
	targetMailboxId: string,
	sourceMailboxId?: string
): Promise<void> {
	if (ids.length === 0) return;
	const changes: Record<string, EmailMailboxChange> = {};
	for (const id of ids) {
		changes[id] = {
			add: [targetMailboxId],
			remove:
				sourceMailboxId && sourceMailboxId !== targetMailboxId ? [sourceMailboxId] : []
		};
	}
	await updateEmailMailboxes(client, accountId, changes);
}

export const trashEmail = (
	client: JMAPClient, accountId: string, id: string,
	currentMailboxId: string, trashMailboxId: string
) => moveEmail(client, accountId, id, trashMailboxId, currentMailboxId);

export const archiveEmail = (
	client: JMAPClient, accountId: string, id: string,
	currentMailboxId: string, archiveMailboxId: string
) => moveEmail(client, accountId, id, archiveMailboxId, currentMailboxId);

export const spamEmail = (
	client: JMAPClient, accountId: string, id: string,
	currentMailboxId: string, junkMailboxId: string
) => moveEmail(client, accountId, id, junkMailboxId, currentMailboxId);

/**
 * Mark an email as spam: move to Junk AND set the `$junk` IMAP keyword
 * (clearing `$notjunk` if set) so Stalwart's Bayesian classifier can
 * learn from the correction. One Email/set patch updates both at once.
 */
export async function markAsSpam(
	client: JMAPClient,
	accountId: string,
	id: string,
	currentMailboxId: string,
	junkMailboxId: string
): Promise<void> {
	await updateEmailMailboxes(client, accountId, {
		[id]: {
			add: [junkMailboxId],
			remove:
				currentMailboxId && currentMailboxId !== junkMailboxId ? [currentMailboxId] : [],
			keywords: { $junk: true, $notjunk: false }
		}
	});
}

/**
 * Mark an email as NOT spam: move from Junk back to Inbox AND flip the
 * keywords so the classifier learns which direction this message
 * belongs in.
 */
export async function markAsNotSpam(
	client: JMAPClient,
	accountId: string,
	id: string,
	junkMailboxId: string,
	inboxMailboxId: string
): Promise<void> {
	await updateEmailMailboxes(client, accountId, {
		[id]: {
			add: [inboxMailboxId],
			remove: [junkMailboxId],
			keywords: { $junk: false, $notjunk: true }
		}
	});
}

/** Batch version of {@link markAsSpam}. */
export async function markManyAsSpam(
	client: JMAPClient,
	accountId: string,
	ids: string[],
	currentMailboxId: string,
	junkMailboxId: string
): Promise<void> {
	if (ids.length === 0) return;
	const changes: Record<string, EmailMailboxChange> = {};
	for (const id of ids) {
		changes[id] = {
			add: [junkMailboxId],
			remove:
				currentMailboxId && currentMailboxId !== junkMailboxId ? [currentMailboxId] : [],
			keywords: { $junk: true, $notjunk: false }
		};
	}
	await updateEmailMailboxes(client, accountId, changes);
}

/** Batch version of {@link markAsNotSpam}. */
export async function markManyAsNotSpam(
	client: JMAPClient,
	accountId: string,
	ids: string[],
	junkMailboxId: string,
	inboxMailboxId: string
): Promise<void> {
	if (ids.length === 0) return;
	const changes: Record<string, EmailMailboxChange> = {};
	for (const id of ids) {
		changes[id] = {
			add: [inboxMailboxId],
			remove: [junkMailboxId],
			keywords: { $junk: false, $notjunk: true }
		};
	}
	await updateEmailMailboxes(client, accountId, changes);
}

export const forwardEmail = sendEmail;

/**
 * Like `searchEmails` but takes a pre-built JMAP filter tree. Used by the
 * operator-based search parser (Phase 12) which constructs its own tree.
 */
export async function queryAndFetchEmailsWithFilter(
	client: JMAPClient,
	accountId: string,
	filter: Record<string, unknown>,
	options: { position?: number; limit?: number } = {}
): Promise<EmailQueryResult> {
	return searchEmails(client, accountId, filter, options);
}

export async function searchEmails(
	client: JMAPClient,
	accountId: string,
	filter: Record<string, unknown>,
	options: { position?: number; limit?: number } = {}
): Promise<EmailQueryResult> {
	const { position = 0, limit = 50 } = options;

	const response = await client.request([
		[
			'Email/query',
			{
				accountId,
				filter,
				sort: [{ property: 'receivedAt', isAscending: false }],
				position,
				limit,
				calculateTotal: true
			},
			'q'
		],
		[
			'Email/get',
			{
				accountId,
				'#ids': { resultOf: 'q', name: 'Email/query', path: '/ids' },
				properties: LIST_PROPERTIES
			},
			'g'
		]
	]);

	const queryResult = response.methodResponses[0][1] as { total: number };
	const getResult = response.methodResponses[1][1] as { list: Email[] };

	return {
		emails: getResult.list,
		total: queryResult.total
	};
}

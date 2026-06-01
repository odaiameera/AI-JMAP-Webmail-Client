import type { JMAPClient } from './client';
import type { ComposeAttachment, ComposeEmail, Email, EmailAddress, EmailQueryResult } from './types';

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
	await client.request([
		[
			'Email/set',
			{
				accountId,
				update: {
					[id]: {
						'keywords/$seen': read ? true : null
					}
				}
			},
			'0'
		]
	]);
}

export async function moveEmail(
	client: JMAPClient,
	accountId: string,
	id: string,
	targetMailboxId: string,
	sourceMailboxId?: string
): Promise<void> {
	const patch: Record<string, unknown> = {
		[`mailboxIds/${targetMailboxId}`]: true
	};
	if (sourceMailboxId && sourceMailboxId !== targetMailboxId) {
		patch[`mailboxIds/${sourceMailboxId}`] = null;
	}

	await client.request([
		['Email/set', { accountId, update: { [id]: patch } }, '0']
	]);
}

/**
 * Move a batch of emails in a single Email/set call. Each id is detached
 * from `sourceMailboxId` (when supplied and different from the target) and
 * attached to `targetMailboxId`. One round-trip regardless of batch size.
 */
export async function moveEmails(
	client: JMAPClient,
	accountId: string,
	ids: string[],
	targetMailboxId: string,
	sourceMailboxId?: string
): Promise<void> {
	if (ids.length === 0) return;
	const update: Record<string, Record<string, unknown>> = {};
	for (const id of ids) {
		const patch: Record<string, unknown> = {
			[`mailboxIds/${targetMailboxId}`]: true
		};
		if (sourceMailboxId && sourceMailboxId !== targetMailboxId) {
			patch[`mailboxIds/${sourceMailboxId}`] = null;
		}
		update[id] = patch;
	}
	await client.request([
		['Email/set', { accountId, update }, '0']
	]);
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
	const patch: Record<string, unknown> = {
		[`mailboxIds/${junkMailboxId}`]: true,
		'keywords/$junk': true,
		'keywords/$notjunk': null
	};
	if (currentMailboxId && currentMailboxId !== junkMailboxId) {
		patch[`mailboxIds/${currentMailboxId}`] = null;
	}
	await client.request([
		['Email/set', { accountId, update: { [id]: patch } }, '0']
	]);
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
	await client.request([
		[
			'Email/set',
			{
				accountId,
				update: {
					[id]: {
						[`mailboxIds/${junkMailboxId}`]: null,
						[`mailboxIds/${inboxMailboxId}`]: true,
						'keywords/$junk': null,
						'keywords/$notjunk': true
					}
				}
			},
			'0'
		]
	]);
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
	const update: Record<string, Record<string, unknown>> = {};
	for (const id of ids) {
		const patch: Record<string, unknown> = {
			[`mailboxIds/${junkMailboxId}`]: true,
			'keywords/$junk': true,
			'keywords/$notjunk': null
		};
		if (currentMailboxId && currentMailboxId !== junkMailboxId) {
			patch[`mailboxIds/${currentMailboxId}`] = null;
		}
		update[id] = patch;
	}
	await client.request([['Email/set', { accountId, update }, '0']]);
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
	const update: Record<string, Record<string, unknown>> = {};
	for (const id of ids) {
		update[id] = {
			[`mailboxIds/${junkMailboxId}`]: null,
			[`mailboxIds/${inboxMailboxId}`]: true,
			'keywords/$junk': null,
			'keywords/$notjunk': true
		};
	}
	await client.request([['Email/set', { accountId, update }, '0']]);
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

import type { JMAPClient } from './client';
import type { ComposeEmail, Email, EmailAddress, EmailQueryResult } from './types';

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
	options: { position?: number; limit?: number } = {}
): Promise<EmailQueryResult> {
	const { position = 0, limit = 50 } = options;

	const response = await client.request([
		[
			'Email/query',
			{
				accountId,
				filter: { inMailbox: mailboxId },
				sort: [{ property: 'receivedAt', isAscending: false }],
				position,
				limit
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
					'htmlBody', 'textBody', 'bodyValues'
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

	if (compose.isHtml) {
		emailCreate.htmlBody = [{ partId: 'body', type: 'text/html' }];
	} else {
		emailCreate.textBody = [{ partId: 'body', type: 'text/plain' }];
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
	sentMailboxId: string
): Promise<{ success: boolean; error?: string }> {
	// Step 1: Create the email in Sent + get identity
	const emailCreate = buildEmailCreate(compose);
	emailCreate.mailboxIds = { [sentMailboxId]: true };
	delete emailCreate.keywords;

	const createResponse = await client.request([
		[
			'Email/set',
			{
				accountId,
				create: { draft1: emailCreate }
			},
			'0'
		],
		[
			'Identity/get',
			{
				accountId,
				ids: null
			},
			'1'
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

	const identityResult = createResponse.methodResponses[1][1] as {
		list?: Array<{ id: string; email: string }>;
	};

	const identity = identityResult.list?.[0];
	if (!identity) {
		return { success: false, error: 'No sending identity found' };
	}

	// Step 2: Submit the email — use identity email for mailFrom
	const allRecipients: EmailAddress[] = [...compose.to, ...compose.cc];

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

import type { JMAPClient } from './client';
import type { Email, EmailQueryResult } from './types';

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

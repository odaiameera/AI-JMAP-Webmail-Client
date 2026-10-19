import { describe, expect, it, vi } from 'vitest';
import { buildEnvelope, saveDraft, sendEmail, submitStoredEmail } from './email';
import type { JMAPClient } from './client';
import type { ComposeEmail } from './types';

const compose: ComposeEmail = {
	from: { name: 'Odai', email: 'odai@example.test' },
	to: [{ name: null, email: 'dana@example.test' }],
	cc: [],
	bcc: [{ name: null, email: 'secret@example.test' }],
	subject: 'Hello',
	body: '<p>Hi <b>Dana</b></p>',
	inReplyTo: 'orig@mail.example.test',
	references: 'root@mail.example.test orig@mail.example.test',
	importance: 'high'
};

function clientReturning(methodResponses: unknown[]) {
	const request = vi.fn().mockResolvedValue({ methodResponses, sessionState: 's' });
	return { client: { request } as unknown as JMAPClient, request };
}

describe('sendEmail', () => {
	it('creates the message as a draft, submits it, and moves it to Sent only on success', async () => {
		const { client, request } = clientReturning([
			['Email/set', { created: { draft1: { id: 'M1' } } }, '0'],
			['EmailSubmission/set', { created: { sub1: { id: 'S1' } } }, '1'],
			['Email/set', { updated: { M1: null } }, '1']
		]);

		const result = await sendEmail(client, 'acct', compose, { drafts: 'D', sent: 'S' }, { id: 'I1', email: 'odai@example.test' }, { replaceDraftId: 'OLD' });

		expect(result).toEqual({ success: true });
		const [calls] = request.mock.calls[0];
		const [emailSet, submissionSet] = calls;

		expect(emailSet[0]).toBe('Email/set');
		const created = emailSet[1].create.draft1;
		expect(created.mailboxIds).toEqual({ D: true });
		expect(created.keywords).toEqual({ $draft: true, $seen: true });
		expect(emailSet[1].destroy).toEqual(['OLD']);
		// multipart/alternative: an HTML part and its plain-text rendering
		expect(created.htmlBody).toEqual([{ partId: 'body', type: 'text/html' }]);
		expect(created.textBody).toEqual([{ partId: 'text', type: 'text/plain' }]);
		expect(created.bodyValues.text.value).toBe('Hi Dana');
		// threading by Message-ID, and importance headers
		expect(created.inReplyTo).toEqual(['orig@mail.example.test']);
		expect(created.references).toEqual(['root@mail.example.test', 'orig@mail.example.test']);
		expect(created['header:Importance:asText']).toBe('high');
		expect(created['header:X-Priority:asText']).toBe('1 (Highest)');

		expect(submissionSet[0]).toBe('EmailSubmission/set');
		expect(submissionSet[1].create.sub1).toEqual({
			emailId: '#draft1',
			identityId: 'I1',
			envelope: {
				mailFrom: { email: 'odai@example.test' },
				rcptTo: [{ email: 'dana@example.test' }, { email: 'secret@example.test' }]
			}
		});
		expect(submissionSet[1].onSuccessUpdateEmail).toEqual({
			'#sub1': { mailboxIds: { S: true }, keywords: { $seen: true } }
		});
	});

	it('keeps the message as a draft and returns its id when the submission is rejected', async () => {
		const { client } = clientReturning([
			['Email/set', { created: { draft1: { id: 'M1' } } }, '0'],
			['EmailSubmission/set', { notCreated: { sub1: { type: 'forbiddenToSend', description: 'Quota' } } }, '1']
		]);
		const result = await sendEmail(client, 'acct', compose, { drafts: 'D', sent: 'S' }, { id: 'I1', email: 'odai@example.test' });
		expect(result).toEqual({ success: false, error: 'Quota', draftId: 'M1' });
	});

	it('reports a message the server would not create', async () => {
		const { client } = clientReturning([
			['Email/set', { notCreated: { draft1: { type: 'invalidProperties', description: 'bad to' } } }, '0'],
			['EmailSubmission/set', { notCreated: { sub1: { type: 'invalidProperties' } } }, '1']
		]);
		const result = await sendEmail(client, 'acct', compose, { drafts: 'D', sent: 'S' }, { id: 'I1', email: 'odai@example.test' });
		expect(result).toEqual({ success: false, error: 'bad to' });
	});

	it('sets no importance headers for normal importance', async () => {
		const { client, request } = clientReturning([
			['Email/set', { created: { draft1: { id: 'M1' } } }, '0'],
			['EmailSubmission/set', { created: { sub1: { id: 'S1' } } }, '1']
		]);
		await sendEmail(client, 'acct', { ...compose, importance: 'normal' }, { drafts: 'D', sent: 'S' }, { id: 'I1', email: 'odai@example.test' });
		const created = request.mock.calls[0][0][0][1].create.draft1;
		expect(created['header:Importance:asText']).toBeUndefined();
		expect(request.mock.calls[0][0][0][1].destroy).toBeUndefined();
	});
});

describe('saveDraft', () => {
	it('replaces the previous version of the draft in the same Email/set', async () => {
		const { client, request } = clientReturning([['Email/set', { created: { draft1: { id: 'M2' } }, destroyed: ['M1'] }, '0']]);
		const result = await saveDraft(client, 'acct', 'D', compose, 'M1');
		expect(result).toEqual({ success: true, id: 'M2' });
		const args = request.mock.calls[0][0][0][1];
		expect(args.destroy).toEqual(['M1']);
		expect(args.create.draft1.mailboxIds).toEqual({ D: true });
	});

	it('creates a first draft without destroying anything', async () => {
		const { client, request } = clientReturning([['Email/set', { created: { draft1: { id: 'M1' } } }, '0']]);
		await saveDraft(client, 'acct', 'D', compose);
		expect(request.mock.calls[0][0][0][1].destroy).toBeUndefined();
	});
});

describe('buildEnvelope', () => {
	it('includes Bcc and lists each address once', () => {
		expect(
			buildEnvelope(
				{
					to: [{ name: null, email: 'dana@example.test' }],
					cc: [{ name: 'Dana', email: 'Dana@Example.test' }],
					bcc: [{ name: null, email: 'secret@example.test' }]
				},
				'me@example.test'
			)
		).toEqual({
			mailFrom: { email: 'me@example.test' },
			rcptTo: [{ email: 'dana@example.test' }, { email: 'secret@example.test' }]
		});
	});
});

describe('scheduled messages', () => {
	it('carry their send time as the Date header', async () => {
		const { client, request } = clientReturning([['Email/set', { created: { draft1: { id: 'M1' } } }, '0']]);
		await saveDraft(client, 'acct', 'SCHED', { ...compose, sentAt: '2026-10-20T07:00:00Z' });
		const created = request.mock.calls[0][0][0][1].create.draft1;
		expect(created.sentAt).toBe('2026-10-20T07:00:00Z');
		expect(created.mailboxIds).toEqual({ SCHED: true });
	});

	const envelope = { mailFrom: { email: 'me@example.test' }, rcptTo: [{ email: 'dana@example.test' }] };
	const boxes = { scheduled: 'SCHED', sent: 'SENT' };

	it('are submitted as stored and moved to Sent', async () => {
		const request = vi
			.fn()
			.mockResolvedValueOnce({ methodResponses: [['Email/get', { list: [{ id: 'M1', mailboxIds: { SCHED: true } }] }, '0']] })
			.mockResolvedValueOnce({ methodResponses: [['EmailSubmission/set', { created: { sub1: { id: 'S1' } } }, '0']] });
		const client = { request } as unknown as JMAPClient;

		expect(await submitStoredEmail(client, 'acct', 'M1', 'I1', envelope, boxes)).toEqual({ status: 'sent' });
		const [[submission]] = request.mock.calls[1];
		expect(submission[1].create.sub1).toEqual({ emailId: 'M1', identityId: 'I1', envelope });
		expect(submission[1].onSuccessUpdateEmail).toEqual({
			'#sub1': { mailboxIds: { SENT: true }, keywords: { $seen: true } }
		});
	});

	it('aren’t sent once they have left Scheduled', async () => {
		for (const list of [[], [{ id: 'M1', mailboxIds: { DRAFTS: true } }]]) {
			const request = vi.fn().mockResolvedValueOnce({ methodResponses: [['Email/get', { list }, '0']] });
			const client = { request } as unknown as JMAPClient;
			expect(await submitStoredEmail(client, 'acct', 'M1', 'I1', envelope, boxes)).toEqual({ status: 'gone' });
			expect(request).toHaveBeenCalledTimes(1);
		}
	});

	it('report why the server refused them', async () => {
		const request = vi
			.fn()
			.mockResolvedValueOnce({ methodResponses: [['Email/get', { list: [{ id: 'M1', mailboxIds: { SCHED: true } }] }, '0']] })
			.mockResolvedValueOnce({
				methodResponses: [['EmailSubmission/set', { notCreated: { sub1: { type: 'forbiddenToSend', description: 'Quota exceeded' } } }, '0']]
			});
		const client = { request } as unknown as JMAPClient;
		expect(await submitStoredEmail(client, 'acct', 'M1', 'I1', envelope, boxes)).toEqual({
			status: 'failed',
			error: 'Quota exceeded'
		});
	});
});

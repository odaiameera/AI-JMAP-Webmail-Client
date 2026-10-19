import type { JMAPClient } from './client';
import type { Mailbox } from './types';

export async function getMailboxes(client: JMAPClient, accountId: string): Promise<Mailbox[]> {
	const response = await client.request([
		[
			'Mailbox/get',
			{
				accountId,
				ids: null,
				properties: ['id', 'name', 'role', 'sortOrder', 'totalEmails', 'unreadEmails', 'parentId']
			},
			'0'
		]
	]);

	const [, result] = response.methodResponses[0];
	const list = (result as { list: Mailbox[] }).list;

	return list.sort((a, b) => {
		const roleOrder = getRoleOrder(a.role) - getRoleOrder(b.role);
		if (roleOrder !== 0) return roleOrder;
		return a.sortOrder - b.sortOrder;
	});
}

export const REMIND_ME_LATER_NAME = 'Remind Me Later';

export async function ensureRemindMeLaterMailbox(
	client: JMAPClient,
	accountId: string
): Promise<string> {
	const mailboxes = await getMailboxes(client, accountId);
	const existing = mailboxes.find(
		(m) => m.name === REMIND_ME_LATER_NAME && m.parentId === null
	);
	if (existing) return existing.id;

	const response = await client.request([
		[
			'Mailbox/set',
			{
				accountId,
				create: { rml1: { name: REMIND_ME_LATER_NAME, parentId: null } }
			},
			'0'
		]
	]);

	const result = response.methodResponses[0][1] as {
		created?: Record<string, { id: string }>;
	};
	return result.created?.rml1?.id ?? '';
}

/**
 * Messages waiting for Send later or Undo send. A server may mark such a
 * folder with the 'scheduled' role; otherwise it's ours, found by name at
 * the top level like Remind Me Later.
 */
export const SCHEDULED_NAME = 'Scheduled';

export function isScheduledMailbox(m: Pick<Mailbox, 'name' | 'role' | 'parentId'>): boolean {
	return m.role === 'scheduled' || (m.role === null && m.parentId === null && m.name === SCHEDULED_NAME);
}

export async function ensureScheduledMailbox(client: JMAPClient, accountId: string): Promise<string> {
	const mailboxes = await getMailboxes(client, accountId);
	const existing = mailboxes.find(isScheduledMailbox);
	if (existing) return existing.id;

	const response = await client.request([
		['Mailbox/set', { accountId, create: { sch1: { name: SCHEDULED_NAME, parentId: null } } }, '0']
	]);
	const result = response.methodResponses[0][1] as { created?: Record<string, { id: string }> };
	return result.created?.sch1?.id ?? '';
}

export async function ensureArchiveMailbox(client: JMAPClient, accountId: string): Promise<string> {
	const mailboxes = await getMailboxes(client, accountId);
	const archive = mailboxes.find((m) => m.role === 'archive');
	if (archive) return archive.id;

	const response = await client.request([
		[
			'Mailbox/set',
			{
				accountId,
				create: { arch1: { name: 'Archive', role: 'archive' } }
			},
			'0'
		]
	]);

	const result = response.methodResponses[0][1] as {
		created?: Record<string, { id: string }>;
	};

	return result.created?.arch1?.id ?? '';
}

function getRoleOrder(role: string | null): number {
	const order: Record<string, number> = {
		inbox: 0,
		drafts: 1,
		sent: 2,
		trash: 3,
		junk: 4
	};
	if (!role) return 10;
	return order[role] ?? 5;
}

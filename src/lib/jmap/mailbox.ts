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

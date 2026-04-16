import type { JMAPClient } from './client';
import type { Mailbox } from './types';
import { LABEL_PREFIX, labelMailboxName } from '$lib/types/labels';

export type CreateLabelResult = { id: string } | { error: string };
export type MutateLabelResult = { success: true; id?: string } | { success: false; error: string };

/**
 * Return every mailbox whose name begins with `labels/`. Stalwart's
 * Mailbox/query filter support is thin, so we list everything and filter
 * in JS — mailbox counts per account are small.
 */
export async function listLabelMailboxes(
	client: JMAPClient,
	accountId: string
): Promise<Mailbox[]> {
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

	const result = response.methodResponses[0][1] as { list: Mailbox[] };
	return (result.list ?? []).filter((m) => m.name.startsWith(LABEL_PREFIX));
}

/**
 * Create a `labels/<slug>` mailbox at the root. Returns the new id, or an
 * error message if Stalwart refused (e.g. name collision).
 */
export async function createLabelMailbox(
	client: JMAPClient,
	accountId: string,
	displayName: string
): Promise<CreateLabelResult> {
	const name = labelMailboxName(displayName);

	const response = await client.request([
		[
			'Mailbox/set',
			{
				accountId,
				create: {
					lbl1: { name, role: null, parentId: null }
				}
			},
			'0'
		]
	]);

	const result = response.methodResponses[0][1] as {
		created?: Record<string, { id: string }>;
		notCreated?: Record<string, { type: string; description?: string }>;
	};

	if (result.notCreated?.lbl1) {
		const err = result.notCreated.lbl1;
		return { error: err.description ?? err.type ?? 'Failed to create label mailbox' };
	}

	const id = result.created?.lbl1?.id;
	if (!id) return { error: 'Label mailbox created but no id returned' };
	return { id };
}

/**
 * Rename a label mailbox to `labels/<slug(newDisplayName)>`.
 */
export async function renameLabelMailbox(
	client: JMAPClient,
	accountId: string,
	id: string,
	newDisplayName: string
): Promise<MutateLabelResult> {
	const name = labelMailboxName(newDisplayName);

	const response = await client.request([
		[
			'Mailbox/set',
			{
				accountId,
				update: { [id]: { name } }
			},
			'0'
		]
	]);

	const result = response.methodResponses[0][1] as {
		notUpdated?: Record<string, { type: string; description?: string }>;
	};

	if (result.notUpdated?.[id]) {
		const err = result.notUpdated[id];
		return { success: false, error: err.description ?? err.type ?? 'Rename failed' };
	}
	return { success: true, id };
}

/**
 * Destroy a label mailbox. We explicitly pass `onDestroyRemoveEmails: false`
 * so messages in the label are detached from it but not deleted — they
 * continue to live in Inbox/Archive/etc.
 */
export async function deleteLabelMailbox(
	client: JMAPClient,
	accountId: string,
	id: string
): Promise<MutateLabelResult> {
	const response = await client.request([
		[
			'Mailbox/set',
			{
				accountId,
				destroy: [id],
				onDestroyRemoveEmails: false
			},
			'0'
		]
	]);

	const result = response.methodResponses[0][1] as {
		destroyed?: string[];
		notDestroyed?: Record<string, { type: string; description?: string }>;
	};

	if (result.notDestroyed?.[id]) {
		const err = result.notDestroyed[id];
		return { success: false, error: err.description ?? err.type ?? 'Delete failed' };
	}
	return { success: true, id };
}

/** Add `labelMailboxId` to the email's mailboxIds (multi-mailbox membership). */
export async function applyLabel(
	client: JMAPClient,
	accountId: string,
	emailId: string,
	labelMailboxId: string
): Promise<void> {
	await client.request([
		[
			'Email/set',
			{
				accountId,
				update: {
					[emailId]: { [`mailboxIds/${labelMailboxId}`]: true }
				}
			},
			'0'
		]
	]);
}

/** Remove `labelMailboxId` from the email's mailboxIds. */
export async function removeLabel(
	client: JMAPClient,
	accountId: string,
	emailId: string,
	labelMailboxId: string
): Promise<void> {
	await client.request([
		[
			'Email/set',
			{
				accountId,
				update: {
					[emailId]: { [`mailboxIds/${labelMailboxId}`]: null }
				}
			},
			'0'
		]
	]);
}

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '$lib/jmap/auth';
import { getMailboxes } from '$lib/jmap/mailbox';
import {
	createFolder,
	deleteFolder,
	moveFolder,
	renameFolder,
	validateFolderName
} from '$lib/jmap/folders';
import { findLabelsParentId, isLabelMailbox, isLabelsParent } from '$lib/types/labels';
import type { Mailbox } from '$lib/jmap/types';

type CreateBody = { action: 'create'; name: string; parentId?: string | null };
type RenameBody = { action: 'rename'; id: string; name: string };
type DeleteBody = { action: 'delete'; id: string };
type MoveBody = { action: 'move'; id: string; newParentId: string | null };
type Body = CreateBody | RenameBody | DeleteBody | MoveBody;

/**
 * True if any `labels/*` mailbox has `id` somewhere in its parent chain.
 * Labels are root-level today, but a user could theoretically nest them
 * under a custom folder — destroying that folder would also destroy the
 * labels and silently break cross-client membership.
 */
function isAncestorOfLabel(id: string, mailboxes: Mailbox[], labelsParentId: string | null): boolean {
	const byId = new Map(mailboxes.map((m) => [m.id, m]));
	for (const m of mailboxes) {
		if (!isLabelMailbox(m, labelsParentId)) continue;
		let cur: Mailbox | undefined = m;
		const seen = new Set<string>();
		while (cur?.parentId && !seen.has(cur.parentId)) {
			if (cur.parentId === id) return true;
			seen.add(cur.parentId);
			cur = byId.get(cur.parentId);
		}
	}
	return false;
}

function isSystem(m: Mailbox): boolean {
	return m.role !== null;
}
/** Label children AND the "Labels" container are off-limits to the folder API. */
function isLabel(m: Mailbox, labelsParentId: string | null): boolean {
	return isLabelMailbox(m, labelsParentId) || isLabelsParent(m, labelsParentId);
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.auth) return json({ error: 'Not authenticated' }, { status: 401 });

	const body = (await request.json()) as Body;
	const client = createClient(locals.auth);
	const accountId = locals.auth.accountId;

	// A single mailbox fetch serves both validation and the refreshed list we
	// return to the client — except after a mutation, where we re-fetch.
	const mailboxes = await getMailboxes(client, accountId);
	const byId = new Map(mailboxes.map((m) => [m.id, m]));
	const labelsParentId = findLabelsParentId(mailboxes);

	switch (body.action) {
		case 'create': {
			const err = validateFolderName(body.name);
			if (err) return json({ success: false, error: err }, { status: 400 });

			if (body.parentId) {
				const parent = byId.get(body.parentId);
				if (!parent) return json({ success: false, error: 'Parent folder not found' }, { status: 404 });
				if (isLabel(parent, labelsParentId)) return json({ success: false, error: 'Cannot nest folders under labels' }, { status: 400 });
			}

			const result = await createFolder(client, accountId, {
				name: body.name.trim(),
				parentId: body.parentId ?? null
			});
			if ('error' in result) return json({ success: false, error: result.error }, { status: 400 });

			const refreshed = await getMailboxes(client, accountId);
			return json({ success: true, id: result.id, mailboxes: refreshed });
		}

		case 'rename': {
			const target = byId.get(body.id);
			if (!target) return json({ success: false, error: 'Folder not found' }, { status: 404 });
			if (isSystem(target)) return json({ success: false, error: 'System folders cannot be renamed' }, { status: 403 });
			if (isLabel(target, labelsParentId)) return json({ success: false, error: 'Rename labels from the Labels settings' }, { status: 400 });

			const err = validateFolderName(body.name);
			if (err) return json({ success: false, error: err }, { status: 400 });

			const result = await renameFolder(client, accountId, body.id, body.name);
			if (!result.success) return json({ success: false, error: result.error }, { status: 400 });

			const refreshed = await getMailboxes(client, accountId);
			return json({ success: true, mailboxes: refreshed });
		}

		case 'delete': {
			const target = byId.get(body.id);
			if (!target) return json({ success: false, error: 'Folder not found' }, { status: 404 });
			if (isSystem(target)) return json({ success: false, error: 'System folders cannot be deleted' }, { status: 403 });
			if (isLabel(target, labelsParentId)) return json({ success: false, error: 'Delete labels from the Labels settings' }, { status: 400 });
			if (isAncestorOfLabel(body.id, mailboxes, labelsParentId)) {
				return json({ success: false, error: 'Remove labels inside this folder first' }, { status: 400 });
			}

			const result = await deleteFolder(client, accountId, body.id);
			if (!result.success) return json({ success: false, error: result.error }, { status: 400 });

			const refreshed = await getMailboxes(client, accountId);
			return json({ success: true, mailboxes: refreshed });
		}

		case 'move': {
			const target = byId.get(body.id);
			if (!target) return json({ success: false, error: 'Folder not found' }, { status: 404 });
			if (isSystem(target)) return json({ success: false, error: 'System folders cannot be moved' }, { status: 403 });
			if (isLabel(target, labelsParentId)) return json({ success: false, error: 'Labels live at the root' }, { status: 400 });

			if (body.newParentId) {
				if (body.newParentId === body.id) {
					return json({ success: false, error: 'A folder cannot be its own parent' }, { status: 400 });
				}
				const parent = byId.get(body.newParentId);
				if (!parent) return json({ success: false, error: 'Parent folder not found' }, { status: 404 });
				if (isLabel(parent, labelsParentId)) return json({ success: false, error: 'Cannot nest folders under labels' }, { status: 400 });

				// Walk the new parent's ancestor chain — prevent creating a cycle.
				let cur: Mailbox | undefined = parent;
				const seen = new Set<string>();
				while (cur?.parentId && !seen.has(cur.parentId)) {
					if (cur.parentId === body.id) {
						return json({ success: false, error: 'Cannot move a folder into one of its descendants' }, { status: 400 });
					}
					seen.add(cur.parentId);
					cur = byId.get(cur.parentId);
				}
			}

			const result = await moveFolder(client, accountId, body.id, body.newParentId);
			if (!result.success) return json({ success: false, error: result.error }, { status: 400 });

			const refreshed = await getMailboxes(client, accountId);
			return json({ success: true, mailboxes: refreshed });
		}

		default:
			return json({ error: 'Unknown action' }, { status: 400 });
	}
};

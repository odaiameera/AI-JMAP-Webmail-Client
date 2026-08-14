import type { Mailbox } from '$lib/jmap/types';
import { findLabelsParentId, isLabelMailbox, isLabelsParent } from '$lib/types/labels';

export type FolderTreeNode = Mailbox & { children: FolderTreeNode[] };

export type FolderOption = {
	id: string;
	name: string;
	depth: number;
};

/**
 * Keep only user-created, non-label mailboxes. Labels are children of the
 * "Labels" container; both the container and its children are excluded, as
 * are system folders (non-null role).
 */
export function filterUserFolders(mailboxes: Mailbox[]): Mailbox[] {
	const labelsParentId = findLabelsParentId(mailboxes);
	return mailboxes.filter(
		(m) =>
			m.role === null &&
			!isLabelMailbox(m, labelsParentId) &&
			!isLabelsParent(m, labelsParentId)
	);
}

/**
 * Build a nested tree of user folders sorted alphabetically at every level.
 */
export function buildFolderTree(mailboxes: Mailbox[]): FolderTreeNode[] {
	const folders = filterUserFolders(mailboxes);
	const byId = new Map<string, FolderTreeNode>(
		folders.map((m) => [m.id, { ...m, children: [] }])
	);
	const roots: FolderTreeNode[] = [];
	for (const node of byId.values()) {
		const parent = node.parentId ? byId.get(node.parentId) : undefined;
		if (parent) parent.children.push(node);
		else roots.push(node);
	}
	const sortLevel = (nodes: FolderTreeNode[]) => {
		nodes.sort((a, b) => a.name.localeCompare(b.name));
		for (const n of nodes) sortLevel(n.children);
	};
	sortLevel(roots);
	return roots;
}

/**
 * Flatten a folder tree into an ordered list with a `depth` hint for
 * indented dropdown rendering.
 */
export function flattenFolderTree(tree: FolderTreeNode[]): FolderOption[] {
	const out: FolderOption[] = [];
	const walk = (nodes: FolderTreeNode[], depth: number) => {
		for (const n of nodes) {
			out.push({ id: n.id, name: n.name, depth });
			walk(n.children, depth + 1);
		}
	};
	walk(tree, 0);
	return out;
}

/**
 * Return the set of folder ids that are descendants of `id` (inclusive).
 * Used to exclude illegal parent choices when editing a folder: you can't
 * re-parent a folder under itself or any of its own children.
 */
export function descendantIds(mailboxes: Mailbox[], id: string): Set<string> {
	const folders = filterUserFolders(mailboxes);
	const childrenOf = new Map<string, Mailbox[]>();
	for (const m of folders) {
		const key = m.parentId ?? '';
		const list = childrenOf.get(key) ?? [];
		list.push(m);
		childrenOf.set(key, list);
	}
	const out = new Set<string>([id]);
	const stack = [id];
	while (stack.length > 0) {
		const cur = stack.pop()!;
		for (const child of childrenOf.get(cur) ?? []) {
			if (!out.has(child.id)) {
				out.add(child.id);
				stack.push(child.id);
			}
		}
	}
	return out;
}

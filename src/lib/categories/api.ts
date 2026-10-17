import { invalidateAll } from '$app/navigation';
import { showToast } from '$lib/stores/toast';
import { INBOX_CATEGORIES, type InboxCategory } from '$lib/types/categories';

function labelOf(category: InboxCategory): string {
	return INBOX_CATEGORIES.find((c) => c.key === category)?.label ?? category;
}

async function post(ids: string[], category: InboxCategory): Promise<boolean> {
	try {
		const res = await fetch('/api/email/bulk', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ids, action: 'setCategory', category })
		});
		return res.ok;
	} catch {
		return false;
	}
}

/**
 * Move emails to an Inbox tab and say so. When every message came from the
 * same tab (`from`), the toast offers Undo, which moves them back there.
 */
export async function moveToCategory(
	ids: string[],
	to: InboxCategory,
	from: InboxCategory | null = null
): Promise<boolean> {
	if (ids.length === 0 || to === from) return true;

	const ok = await post(ids, to);
	await invalidateAll();
	if (!ok) {
		showToast({ message: `Couldn't move to ${labelOf(to)}` });
		return false;
	}

	const what = ids.length === 1 ? 'Moved' : `Moved ${ids.length}`;
	showToast({
		message: `${what} to ${labelOf(to)}`,
		// Long enough to reach Undo, like the restore-from-Trash toast.
		duration: from ? 6000 : undefined,
		action: from
			? {
					label: 'Undo',
					onClick: async () => {
						await post(ids, from);
						await invalidateAll();
					}
				}
			: undefined
	});
	return true;
}

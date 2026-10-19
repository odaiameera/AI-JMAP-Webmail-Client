import { invalidateAll } from '$app/navigation';
import { showToast, type ToastAction } from '$lib/stores/toast';
import { INBOX_CATEGORIES, type InboxCategory } from '$lib/types/categories';

function labelOf(category: InboxCategory): string {
	return INBOX_CATEGORIES.find((c) => c.key === category)?.label ?? category;
}

interface PinSuggestion {
	sender: string;
	category: InboxCategory;
}

async function post(
	ids: string[],
	category: InboxCategory,
	undoOf?: InboxCategory
): Promise<{ ok: boolean; pinSuggestion: PinSuggestion | null }> {
	try {
		const res = await fetch('/api/email/bulk', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ids, action: 'setCategory', category, ...(undoOf ? { undoOf } : {}) })
		});
		const body = res.ok ? await res.json().catch(() => null) : null;
		return { ok: res.ok, pinSuggestion: body?.pinSuggestion ?? null };
	} catch {
		return { ok: false, pinSuggestion: null };
	}
}

async function pinSender({ sender, category }: PinSuggestion): Promise<void> {
	const res = await fetch('/api/jev/pins', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ sender, category })
	}).catch(() => null);
	showToast({
		message: res?.ok
			? `Mail from ${sender} will always go to ${labelOf(category)}`
			: `Couldn't pin ${sender}`
	});
}

/**
 * Move emails to an Inbox tab and say so. When every message came from the
 * same tab (`from`), the toast offers Undo, which moves them back there.
 * When they all came from one sender and Jev reads this account, it also
 * offers to pin that sender to the tab for good.
 */
export async function moveToCategory(
	ids: string[],
	to: InboxCategory,
	from: InboxCategory | null = null
): Promise<boolean> {
	if (ids.length === 0 || to === from) return true;

	const { ok, pinSuggestion } = await post(ids, to);
	await invalidateAll();
	if (!ok) {
		showToast({ message: `Couldn't move to ${labelOf(to)}` });
		return false;
	}

	const what = ids.length === 1 ? 'Moved' : `Moved ${ids.length}`;
	const undo: ToastAction | undefined = from
		? {
				label: 'Undo',
				onClick: async () => {
					await post(ids, from, to);
					await invalidateAll();
				}
			}
		: undefined;
	const pin: ToastAction[] = pinSuggestion
		? [{ label: 'Always for this sender', onClick: () => void pinSender(pinSuggestion) }]
		: [];
	showToast({
		message: `${what} to ${labelOf(to)}`,
		// Long enough to reach Undo or the pin, like the restore-from-Trash toast.
		duration: undo || pin.length ? 8000 : undefined,
		action: undo,
		extraActions: pin
	});
	return true;
}

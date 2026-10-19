import { goto, invalidateAll } from '$app/navigation';
import { page } from '$app/state';
import { isScheduledMailbox } from '$lib/jmap/mailbox';
import type { Mailbox } from '$lib/jmap/types';
import { formatSendTime } from '$lib/utils/send-later';
import { openCompose, type ComposeData } from './compose';
import { showToast } from './toast';

/**
 * What follows Send once the server holds the message for later: a toast
 * with Undo, Undo itself (the message comes back to the composer as it
 * was), and, for Undo send, word of whether it went.
 */

export interface ScheduledSend {
	emailId: string;
	sendAt: string;
	/** Held only for the Undo send window, rather than scheduled for a time. */
	undo: boolean;
}

// Sends taken back here, so their outcome check doesn't report them as sent.
const undone = new Set<string>();

export function afterScheduling(send: ScheduledSend, restore: ComposeData): void {
	// The Scheduled folder appears (on first use) and its list updates.
	void invalidateAll();
	const at = new Date(send.sendAt);
	const action = { label: 'Undo', onClick: () => void undo(send, restore) };
	if (send.undo) {
		const wait = Math.max(0, at.getTime() - Date.now());
		showToast({ message: 'Sending…', duration: wait, action });
		setTimeout(() => void reportOutcome(send.emailId), wait + 1500);
	} else {
		showToast({ message: `Scheduled for ${formatSendTime(at)}`, duration: 8000, action });
	}
}

async function undo(send: ScheduledSend, restore: ComposeData): Promise<void> {
	undone.add(send.emailId);
	const result = await cancelScheduled(send.emailId);
	// Not sent either way. If it couldn't be moved to Drafts it's still in
	// Scheduled, and the composer replaces it there on its next save.
	if (result.success || result.code === 'move-failed') {
		openCompose({ ...restore, draftId: send.emailId });
		void invalidateAll();
		return;
	}
	undone.delete(send.emailId);
	showToast({ message: result.error ?? 'Couldn’t undo' });
}

export async function cancelScheduled(
	emailId: string
): Promise<{ success: boolean; code?: string; error?: string; draftId?: string }> {
	try {
		const res = await fetch(`/api/scheduled/${encodeURIComponent(emailId)}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'cancel' })
		});
		return await res.json();
	} catch {
		return { success: false, error: 'Network error' };
	}
}

async function reportOutcome(emailId: string, tries = 0): Promise<void> {
	if (undone.has(emailId)) return;
	try {
		const res = await fetch(`/api/scheduled/${encodeURIComponent(emailId)}`);
		if (undone.has(emailId)) return;
		if (res.status === 404) {
			showToast({ message: 'Message sent' });
			return;
		}
		if (res.ok && (await res.json()).status === 'failed') {
			const scheduled = (page.data.mailboxes as Mailbox[] | undefined)?.find(isScheduledMailbox);
			showToast({
				message: 'Message not sent',
				duration: 10_000,
				...(scheduled && { action: { label: 'Open', onClick: () => void goto(`/folder/${scheduled.id}`) } })
			});
			return;
		}
	} catch {
		// Try again below.
	}
	if (tries < 5) setTimeout(() => void reportOutcome(emailId, tries + 1), 2000);
}

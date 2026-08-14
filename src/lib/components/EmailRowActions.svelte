<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import RemindMeLaterPicker from './RemindMeLaterPicker.svelte';

	let {
		emailId,
		isUnread,
		sourceMailboxId,
		hasReminder = false
	}: {
		emailId: string;
		isUnread: boolean;
		sourceMailboxId: string;
		/** Email is parked in Remind Me Later — offer Unsnooze instead of the picker. */
		hasReminder?: boolean;
	} = $props();

	let loading = $state<string>('');
	let pickerOpen = $state(false);

	async function act(action: string) {
		if (loading) return;
		loading = action;
		try {
			await fetch(`/api/email/${emailId}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action, sourceMailboxId })
			});
			await invalidateAll();
		} finally {
			loading = '';
		}
	}

	async function unsnooze() {
		if (loading) return;
		loading = 'unsnooze';
		try {
			await fetch(`/api/reminders/${emailId}`, { method: 'DELETE' });
			await invalidateAll();
		} finally {
			loading = '';
		}
	}

	async function scheduleReminder(remindAt: string) {
		pickerOpen = false;
		if (loading) return;
		loading = 'rml';
		try {
			await fetch('/api/reminders', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ emailId, remindAt, sourceMailboxId })
			});
			await invalidateAll();
		} finally {
			loading = '';
		}
	}

	/**
	 * Block the wrapping <a href="/email/id"> from grabbing the click.
	 * The anchor's default navigation happens on the click event, so we
	 * cancel at both mousedown (in case the browser reacts earlier) and
	 * click, and stop propagation so the anchor's own onclick never runs.
	 */
	function stop(e: Event) {
		e.preventDefault();
		e.stopPropagation();
	}
</script>

<div
	class="email-row-actions absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 transition-opacity bg-surface-hover rounded-lg px-1 py-1 shadow-sm ring-1 ring-border z-10"
	onmousedown={stop}
	role="presentation"
>
	<button
		type="button"
		onmousedown={stop}
		onclick={(e) => { stop(e); act('archive'); }}
		disabled={!!loading}
		title="Archive"
		aria-label="Archive"
		class="p-1.5 rounded hover:bg-surface text-text-secondary hover:text-text transition-colors cursor-pointer disabled:opacity-50"
	>
		<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>
	</button>

	{#if hasReminder}
		<button
			type="button"
			onmousedown={stop}
			onclick={(e) => { stop(e); unsnooze(); }}
			disabled={!!loading}
			title="Unsnooze — return to inbox now"
			aria-label="Unsnooze"
			class="p-1.5 rounded hover:bg-surface text-accent hover:text-text transition-colors cursor-pointer disabled:opacity-50"
		>
			<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/><line x1="3" y1="3" x2="21" y2="21"/></svg>
		</button>
	{:else}
		<div class="relative">
			<button
				type="button"
				onmousedown={stop}
				onclick={(e) => { stop(e); pickerOpen = !pickerOpen; }}
				disabled={!!loading}
				title="Remind me later"
				aria-label="Remind me later"
				class="p-1.5 rounded hover:bg-surface transition-colors cursor-pointer disabled:opacity-50 {pickerOpen ? 'text-accent bg-accent/10' : 'text-text-secondary hover:text-text'}"
			>
				<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
			</button>
			{#if pickerOpen}
				<div onclick={stop} onmousedown={stop} onkeydown={(e) => e.stopPropagation()} role="presentation">
					<RemindMeLaterPicker
						onPick={scheduleReminder}
						onClose={() => (pickerOpen = false)}
					/>
				</div>
			{/if}
		</div>
	{/if}

	<button
		type="button"
		onmousedown={stop}
		onclick={(e) => { stop(e); act(isUnread ? 'markRead' : 'markUnread'); }}
		disabled={!!loading}
		title={isUnread ? 'Mark as read' : 'Mark as unread'}
		aria-label={isUnread ? 'Mark as read' : 'Mark as unread'}
		class="p-1.5 rounded hover:bg-surface text-text-secondary hover:text-text transition-colors cursor-pointer disabled:opacity-50"
	>
		{#if isUnread}
			<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><polyline points="22 6 12 13 2 6"/></svg>
		{:else}
			<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8"/><polyline points="22 6 12 13 2 6"/><circle cx="19" cy="19" r="3" fill="currentColor"/></svg>
		{/if}
	</button>

	<button
		type="button"
		onmousedown={stop}
		onclick={(e) => { stop(e); act('trash'); }}
		disabled={!!loading}
		title="Delete"
		aria-label="Delete"
		class="p-1.5 rounded hover:bg-surface text-text-secondary hover:text-danger transition-colors cursor-pointer disabled:opacity-50"
	>
		<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
	</button>
</div>

<style>
	/* Hidden toolbar must not swallow clicks meant for row content under it. */
	.email-row-actions {
		pointer-events: none;
	}
	:global(.email-row:hover) .email-row-actions,
	.email-row-actions:focus-within {
		opacity: 1;
		pointer-events: auto;
	}
</style>

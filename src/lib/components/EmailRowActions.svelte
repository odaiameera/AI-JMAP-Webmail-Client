<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import RemindMeLaterPicker from './RemindMeLaterPicker.svelte';
	import CategoryPicker from './CategoryPicker.svelte';
	import { moveToCategory } from '$lib/categories/api';
	import type { InboxCategory } from '$lib/types/categories';

	let {
		emailId,
		isUnread,
		sourceMailboxId,
		hasReminder = false,
		category = null
	}: {
		emailId: string;
		isUnread: boolean;
		sourceMailboxId: string;
		/** Email is parked in Remind Me Later — offer Unsnooze instead of the picker. */
		hasReminder?: boolean;
		/** The row's Inbox tab; null when the list isn't a tabbed Inbox. */
		category?: InboxCategory | null;
	} = $props();

	let loading = $state<string>('');
	let pickerOpen = $state(false);
	let categoryPickerOpen = $state(false);
	let categoryTriggerEl = $state<HTMLButtonElement | undefined>(undefined);

	async function pickCategory(next: InboxCategory) {
		categoryPickerOpen = false;
		if (loading || !category) return;
		loading = 'setCategory';
		try {
			await moveToCategory([emailId], next, category);
		} finally {
			loading = '';
		}
	}

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

<!-- Sits on the row's first line in the timestamp's slot (the row hides the
     time on hover), on the row's own hover colour so it reads as part of the
     row rather than a card floating across two lines of text. The fade on its
     left lets a long sender name run under it instead of being cut off. -->
<div
	class="email-row-actions absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 transition-opacity bg-surface-hover rounded-md z-10"
	onmousedown={stop}
	role="presentation"
>
	<span aria-hidden="true" class="absolute right-full inset-y-0 w-6 bg-linear-to-l from-surface-hover to-transparent pointer-events-none"></span>
	<button
		type="button"
		onmousedown={stop}
		onclick={(e) => { stop(e); act('archive'); }}
		disabled={!!loading}
		title="Archive"
		aria-label="Archive"
		class="p-1 rounded-md hover:bg-surface text-text-secondary hover:text-text transition-colors cursor-pointer disabled:opacity-50"
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
			class="p-1 rounded-md hover:bg-surface text-accent-fg hover:text-text transition-colors cursor-pointer disabled:opacity-50"
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
				class="p-1 rounded-md hover:bg-surface transition-colors cursor-pointer disabled:opacity-50 {pickerOpen ? 'text-accent-fg bg-accent/10' : 'text-text-secondary hover:text-text'}"
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

	{#if category}
		<button
			bind:this={categoryTriggerEl}
			type="button"
			onmousedown={stop}
			onclick={(e) => { stop(e); categoryPickerOpen = !categoryPickerOpen; }}
			disabled={!!loading}
			title="Move to tab"
			aria-label="Move to tab"
			aria-haspopup="menu"
			aria-expanded={categoryPickerOpen}
			class="p-1 rounded-md hover:bg-surface transition-colors cursor-pointer disabled:opacity-50 {categoryPickerOpen ? 'text-accent-fg bg-accent/10' : 'text-text-secondary hover:text-text'}"
		>
			<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
		</button>
		{#if categoryPickerOpen}
			<!-- Rendered on <body>, so its clicks never reach the row link. -->
			<CategoryPicker
				current={category}
				anchor={categoryTriggerEl ?? null}
				onPick={pickCategory}
				onClose={() => (categoryPickerOpen = false)}
			/>
		{/if}
	{/if}

	<button
		type="button"
		onmousedown={stop}
		onclick={(e) => { stop(e); act(isUnread ? 'markRead' : 'markUnread'); }}
		disabled={!!loading}
		title={isUnread ? 'Mark as read' : 'Mark as unread'}
		aria-label={isUnread ? 'Mark as read' : 'Mark as unread'}
		class="p-1 rounded-md hover:bg-surface text-text-secondary hover:text-text transition-colors cursor-pointer disabled:opacity-50"
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
		class="p-1 rounded-md hover:bg-surface text-text-secondary hover:text-danger transition-colors cursor-pointer disabled:opacity-50"
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

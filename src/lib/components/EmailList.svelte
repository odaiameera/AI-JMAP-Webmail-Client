<script lang="ts">
	import EmailListItem from './EmailListItem.svelte';
	import { openCompose } from '$lib/stores/compose';
	import { invalidateAll } from '$app/navigation';
	import type { Email } from '$lib/jmap/types';

	let { emails, total, title, mailboxId = '' }: {
		emails: Email[];
		total: number;
		title: string;
		mailboxId?: string;
	} = $props();

	let selectedIds = $state(new Set<string>());
	let bulkLoading = $state('');

	const allSelected = $derived(emails.length > 0 && selectedIds.size === emails.length);

	function toggleSelect(id: string, checked: boolean) {
		const next = new Set(selectedIds);
		if (checked) next.add(id);
		else next.delete(id);
		selectedIds = next;
	}

	function toggleAll() {
		if (allSelected) {
			selectedIds = new Set();
		} else {
			selectedIds = new Set(emails.map((e) => e.id));
		}
	}

	function clearSelection() {
		selectedIds = new Set();
	}

	async function bulkAction(action: string) {
		if (selectedIds.size === 0) return;
		bulkLoading = action;
		try {
			await fetch('/api/email/bulk', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					ids: [...selectedIds],
					action,
					sourceMailboxId: mailboxId
				})
			});
			selectedIds = new Set();
			await invalidateAll();
		} finally {
			bulkLoading = '';
		}
	}

	async function refresh() {
		await invalidateAll();
	}
</script>

<div class="h-full flex flex-col">
	<header class="ribbon px-4 py-2 border-b border-border flex items-center gap-2 shrink-0">
		{#if selectedIds.size > 0}
			<!-- Bulk actions mode -->
			<div class="shrink-0">
				<input
					type="checkbox"
					checked={allSelected}
					onchange={toggleAll}
					class="w-3.5 h-3.5 accent-accent cursor-pointer"
				/>
			</div>
			<span class="text-sm text-text-secondary">{selectedIds.size} selected</span>
			<div class="flex items-center gap-1 ml-2">
				<button onclick={() => bulkAction('markRead')} title="Mark Read" disabled={!!bulkLoading}
					class="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-text transition-colors cursor-pointer disabled:opacity-50">
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><polyline points="22 6 12 13 2 6"/></svg>
				</button>
				<button onclick={() => bulkAction('markUnread')} title="Mark Unread" disabled={!!bulkLoading}
					class="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-text transition-colors cursor-pointer disabled:opacity-50">
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8"/><polyline points="22 6 12 13 2 6"/><circle cx="19" cy="19" r="3" fill="currentColor"/></svg>
				</button>
				<button onclick={() => bulkAction('archive')} title="Archive" disabled={!!bulkLoading}
					class="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-text transition-colors cursor-pointer disabled:opacity-50">
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>
				</button>
				<button onclick={() => bulkAction('trash')} title="Trash" disabled={!!bulkLoading}
					class="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-red-400 transition-colors cursor-pointer disabled:opacity-50">
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
				</button>
				<button onclick={() => bulkAction('spam')} title="Spam" disabled={!!bulkLoading}
					class="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-text transition-colors cursor-pointer disabled:opacity-50">
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4.9 4.9 14.2 14.2M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/></svg>
				</button>
			</div>
			<div class="flex-1"></div>
			<button onclick={clearSelection} title="Clear selection"
				class="p-1.5 rounded hover:bg-surface-hover text-text-tertiary hover:text-text transition-colors cursor-pointer text-sm">
				&times;
			</button>
		{:else}
			<!-- Default mode -->
			<div class="shrink-0">
				<input
					type="checkbox"
					checked={false}
					onchange={toggleAll}
					class="w-3.5 h-3.5 accent-accent cursor-pointer"
				/>
			</div>
			<span class="text-sm font-medium text-text">{title}</span>
			<span class="text-xs text-text-tertiary">{total} messages</span>
			<div class="flex-1"></div>
			<button onclick={() => openCompose()} title="Compose"
				class="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-text transition-colors cursor-pointer">
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/></svg>
			</button>
			<button onclick={refresh} title="Refresh"
				class="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-text transition-colors cursor-pointer">
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
			</button>
		{/if}
	</header>

	<div class="flex-1 overflow-y-auto">
		{#if emails.length === 0}
			<div class="flex items-center justify-center h-full text-text-tertiary">
				<p>No messages</p>
			</div>
		{:else}
			{#each emails as email (email.id)}
				<EmailListItem
					{email}
					selected={selectedIds.has(email.id)}
					onSelect={toggleSelect}
				/>
			{/each}
		{/if}
	</div>
</div>

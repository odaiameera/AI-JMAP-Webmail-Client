<script lang="ts">
	import EmailListItem from './EmailListItem.svelte';
	import EmailDetail from './EmailDetail.svelte';
	import FolderPicker from './FolderPicker.svelte';
	import { openCompose } from '$lib/stores/compose';
	import { invalidateAll, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { getContext, setContext } from 'svelte';
	import { get } from 'svelte/store';
	import type { Email, Mailbox } from '$lib/jmap/types';
	import type { Label } from '$lib/types/labels';
	import { bucketFor, type DateBucket } from '$lib/utils/date-buckets';
	import { now } from '$lib/stores/now';
	import { browser } from '$app/environment';

	let {
		emails,
		total,
		title,
		mailboxId = '',
		page: currentPage = 1,
		pageSize = 50,
		totalPages = 1
	}: {
		emails: Email[];
		total: number;
		title: string;
		mailboxId?: string;
		page?: number;
		pageSize?: number;
		totalPages?: number;
	} = $props();

	const rangeStart = $derived(total === 0 ? 0 : (currentPage - 1) * pageSize + 1);
	const rangeEnd = $derived(Math.min(currentPage * pageSize, total));

	function goToPage(n: number) {
		const url = new URL(page.url);
		if (n <= 1) url.searchParams.delete('page');
		else url.searchParams.set('page', String(n));
		goto(url.pathname + url.search, { keepFocus: true, noScroll: true });
	}

	const mailboxes = $derived<Mailbox[]>(page.data.mailboxes ?? []);
	const allLabels = getContext<Label[]>('labels') ?? [];

	// Expose the current list's mailbox + reminded-id set to nested
	// EmailListItems so they can render per-row hover actions without a
	// long prop chain.
	setContext('listMailboxId', () => mailboxId);
	// Getter so callers always see the current page's marker set even
	// after invalidateAll() refreshes the load data without remounting.
	setContext('remindedIds', () => new Set<string>(page.data.remindedIds ?? []));

	const readingPane = getContext<{ subscribe: (fn: (v: boolean) => void) => () => void; toggle: () => void }>('readingPane');
	// Read the store synchronously so the pane renders in its real state
	// on first paint instead of flashing closed for ~200ms while waiting
	// for the subscription effect to mount.
	let paneOpen = $state(get(readingPane));
	$effect(() => {
		const unsub = readingPane.subscribe((v: boolean) => { paneOpen = v; });
		return unsub;
	});

	let selectedIds = $state(new Set<string>());
	let bulkLoading = $state('');
	let previewEmail = $state<Email | null>(null);
	let listWidth = $state(420);
	let dragging = $state(false);
	let loadingPreview = $state(false);
	let showMovePicker = $state(false);
	let moveTriggerEl = $state<HTMLButtonElement | undefined>(undefined);

	/**
	 * Build the payload for a dragstart on a list row. If the dragged email
	 * is part of a multi-selection, move all selected ids; otherwise drag
	 * just this one so users can drag a row without selecting it first.
	 */
	function handleRowDragStart(email: Email, e: DragEvent) {
		if (!e.dataTransfer) return;
		const ids = selectedIds.has(email.id) && selectedIds.size > 1
			? [...selectedIds]
			: [email.id];
		e.dataTransfer.setData('application/x-email-ids', JSON.stringify(ids));
		e.dataTransfer.effectAllowed = 'move';
	}

	async function bulkMoveTo(targetMailboxId: string) {
		if (selectedIds.size === 0) return;
		showMovePicker = false;
		bulkLoading = 'moveTo';
		try {
			await fetch('/api/email/bulk', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					ids: [...selectedIds],
					action: 'moveTo',
					targetMailboxId,
					sourceMailboxId: mailboxId
				})
			});
			selectedIds = new Set();
			await invalidateAll();
		} finally {
			bulkLoading = '';
		}
	}

	function startDrag(e: MouseEvent) {
		e.preventDefault();
		dragging = true;
		const startX = e.clientX;
		const startWidth = listWidth;

		function onMove(ev: MouseEvent) {
			listWidth = Math.max(280, Math.min(startWidth + (ev.clientX - startX), 800));
		}
		function onUp() {
			dragging = false;
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
		}
		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
	}

	const allSelected = $derived(emails.length > 0 && selectedIds.size === emails.length);

	function toggleSelect(id: string, checked: boolean) {
		const next = new Set(selectedIds);
		if (checked) next.add(id); else next.delete(id);
		selectedIds = next;
	}

	function toggleAll() {
		selectedIds = allSelected ? new Set() : new Set(emails.map((e) => e.id));
	}

	function clearSelection() { selectedIds = new Set(); }

	async function bulkAction(action: string) {
		if (selectedIds.size === 0) return;
		bulkLoading = action;
		try {
			await fetch('/api/email/bulk', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ids: [...selectedIds], action, sourceMailboxId: mailboxId })
			});
			selectedIds = new Set();
			await invalidateAll();
		} finally { bulkLoading = ''; }
	}

	async function refresh() { await invalidateAll(); }

	// --- Date grouping ---

	type EmailGroup = DateBucket & { emails: Email[] };

	const groups = $derived.by<EmailGroup[]>(() => {
		const byKey = new Map<string, EmailGroup>();
		for (const email of emails) {
			const b = bucketFor(email.receivedAt, $now);
			let g = byKey.get(b.key);
			if (!g) {
				g = { ...b, emails: [] };
				byKey.set(b.key, g);
			}
			g.emails.push(email);
		}
		return [...byKey.values()].sort((a, b) => b.sortKey - a.sortKey);
	});

	const COLLAPSE_KEY = 'email-group-collapsed';
	let collapsedGroups = $state<Set<string>>(new Set());
	// Load collapsed state on mount; guarded against SSR.
	if (browser) {
		try {
			const raw = localStorage.getItem(COLLAPSE_KEY);
			if (raw) collapsedGroups = new Set(JSON.parse(raw) as string[]);
		} catch {
			// corrupt entry — ignore
		}
	}

	function toggleGroup(key: string) {
		const next = new Set(collapsedGroups);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		collapsedGroups = next;
		if (browser) {
			try {
				localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next]));
			} catch {
				// quota / private mode — harmless
			}
		}
	}

	async function handlePaneClick(email: Email) {
		loadingPreview = true;
		try {
			const res = await fetch(`/api/email/${email.id}/detail`);
			if (res.ok) {
				previewEmail = await res.json();
			}
		} finally { loadingPreview = false; }
	}
</script>

<div class="h-full flex overflow-hidden">
	<!-- Email list column -->
	<div class="flex flex-col shrink-0 min-w-0 overflow-hidden"
		style={paneOpen ? `width: ${listWidth}px` : 'flex: 1 1 0%; min-width: 0'}>
		<header class="ribbon px-4 py-2 border-b border-border flex items-center gap-2 shrink-0">
			{#if selectedIds.size > 0}
				<div class="shrink-0">
					<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="w-4 h-4 rounded border-2 flex items-center justify-center cursor-pointer transition-colors
								{allSelected ? 'bg-accent border-accent' : 'border-text-tertiary hover:border-text-secondary'}"
							onclick={toggleAll}
							onkeydown={(e) => e.key === ' ' && toggleAll()}
							role="checkbox"
							aria-checked={allSelected}
							tabindex={0}
						>
							{#if allSelected}
								<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
							{/if}
						</div>
				</div>
				<span class="text-sm text-text-secondary">{selectedIds.size} selected</span>
				<div class="flex items-center gap-1 ml-2">
					<button onclick={() => bulkAction('markRead')} title="Mark Read" disabled={!!bulkLoading} class="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-text transition-colors cursor-pointer disabled:opacity-50">
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><polyline points="22 6 12 13 2 6"/></svg>
					</button>
					<button onclick={() => bulkAction('markUnread')} title="Mark Unread" disabled={!!bulkLoading} class="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-text transition-colors cursor-pointer disabled:opacity-50">
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8"/><polyline points="22 6 12 13 2 6"/><circle cx="19" cy="19" r="3" fill="currentColor"/></svg>
					</button>
					<button
						bind:this={moveTriggerEl}
						onclick={(e) => { e.stopPropagation(); showMovePicker = !showMovePicker; }}
						title="Move to…"
						disabled={!!bulkLoading}
						class="p-1.5 rounded hover:bg-surface-hover transition-colors cursor-pointer disabled:opacity-50
							{showMovePicker ? 'text-accent bg-accent/10' : 'text-text-secondary hover:text-text'}"
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
							<path d="M2 9V5a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H20a2 2 0 0 1 2 2"/>
							<path d="M2 13h10"/>
							<path d="m9 16 3-3-3-3"/>
							<path d="M14 13v4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-4"/>
						</svg>
					</button>
					{#if showMovePicker}
						<FolderPicker
							{mailboxes}
							labels={allLabels}
							excludeIds={mailboxId ? [mailboxId] : []}
							anchor={moveTriggerEl ?? null}
							align="left"
							onPick={bulkMoveTo}
							onClose={() => { showMovePicker = false; }}
						/>
					{/if}
					<button onclick={() => bulkAction('archive')} title="Archive" disabled={!!bulkLoading} class="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-text transition-colors cursor-pointer disabled:opacity-50">
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>
					</button>
					<button onclick={() => bulkAction('trash')} title="Trash" disabled={!!bulkLoading} class="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-red-400 transition-colors cursor-pointer disabled:opacity-50">
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
					</button>
					<button onclick={() => bulkAction('spam')} title="Spam" disabled={!!bulkLoading} class="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-text transition-colors cursor-pointer disabled:opacity-50">
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m4.9 4.9 14.2 14.2M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/></svg>
					</button>
				</div>
				<div class="flex-1"></div>
				<button onclick={clearSelection} class="text-text-secondary hover:text-text text-sm px-3 py-1 rounded-md hover:bg-surface-hover transition-colors cursor-pointer">
					Cancel
				</button>
			{:else}
				<div class="shrink-0">
					<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="w-4 h-4 rounded border-2 flex items-center justify-center cursor-pointer transition-colors border-text-tertiary hover:border-text-secondary"
							onclick={toggleAll}
							onkeydown={(e) => e.key === ' ' && toggleAll()}
							role="checkbox"
							aria-checked={false}
							tabindex={0}
						></div>
				</div>
				<span class="text-sm font-medium text-text">{title}</span>
				<span class="text-xs text-text-tertiary">{total} messages</span>
				<div class="flex-1"></div>
				<button onclick={() => readingPane.toggle()} title="Toggle reading pane"
					class="p-1.5 rounded hover:bg-surface-hover transition-colors cursor-pointer {paneOpen ? 'text-accent' : 'text-text-secondary hover:text-text'}">
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="18" rx="2"/><line x1="10" y1="3" x2="10" y2="21"/></svg>
				</button>
				<button onclick={() => openCompose()} title="Compose" class="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-text transition-colors cursor-pointer">
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/></svg>
				</button>
				<button onclick={refresh} title="Refresh" class="p-1.5 rounded hover:bg-surface-hover text-text-secondary hover:text-text transition-colors cursor-pointer">
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
				</button>
			{/if}
		</header>

		<div class="flex-1 overflow-y-auto">
			{#if emails.length === 0}
				<div class="flex items-center justify-center h-full text-text-tertiary"><p>No messages</p></div>
			{:else}
				{#each groups as group (group.key)}
					{@const isCollapsed = collapsedGroups.has(group.key)}
					<button
						type="button"
						onclick={() => toggleGroup(group.key)}
						class="w-full sticky top-0 z-10 flex items-center gap-2 px-4 py-1.5 bg-surface/95 backdrop-blur-sm border-b border-border text-left hover:bg-surface-hover transition-colors cursor-pointer"
					>
						<span
							class="inline-flex items-center justify-center w-4 h-4 text-text-tertiary transition-transform"
							style={isCollapsed ? '' : 'transform: rotate(90deg)'}
						>
							<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
								<polyline points="9 18 15 12 9 6" />
							</svg>
						</span>
						<span class="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
							{group.label}
						</span>
						<span class="text-[11px] text-text-tertiary">{group.emails.length}</span>
					</button>
					{#if !isCollapsed}
						{#each group.emails as email (email.id)}
							<EmailListItem
								{email}
								selected={selectedIds.has(email.id)}
								onSelect={toggleSelect}
								onClick={paneOpen ? handlePaneClick : undefined}
								onDragStart={handleRowDragStart}
								active={paneOpen && previewEmail?.id === email.id}
							/>
						{/each}
					{/if}
				{/each}
			{/if}
		</div>

		{#if total > 0}
			<footer class="flex items-center justify-between px-4 py-2 border-t border-border text-xs text-text-tertiary shrink-0">
				<span class="tabular-nums">{rangeStart}–{rangeEnd} of {total.toLocaleString()}</span>
				<div class="flex items-center gap-1">
					<button
						onclick={() => goToPage(1)}
						disabled={currentPage === 1}
						class="p-1.5 rounded hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
						title="First page"
						aria-label="First page"
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>
					</button>
					<button
						onclick={() => goToPage(currentPage - 1)}
						disabled={currentPage === 1}
						class="p-1.5 rounded hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
						title="Previous page"
						aria-label="Previous page"
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
					</button>
					<span class="px-2 tabular-nums">Page {currentPage} of {totalPages}</span>
					<button
						onclick={() => goToPage(currentPage + 1)}
						disabled={currentPage >= totalPages}
						class="p-1.5 rounded hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
						title="Next page"
						aria-label="Next page"
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
					</button>
					<button
						onclick={() => goToPage(totalPages)}
						disabled={currentPage >= totalPages}
						class="p-1.5 rounded hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
						title="Last page"
						aria-label="Last page"
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>
					</button>
				</div>
			</footer>
		{/if}
	</div>

	{#if paneOpen}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="w-1 shrink-0 bg-border hover:bg-accent/40 cursor-col-resize transition-colors {dragging ? 'bg-accent/40' : ''}"
			onmousedown={startDrag}></div>

		<div class="flex-1 overflow-hidden min-w-0 flex flex-col">
			{#if loadingPreview}
				<div class="flex items-center justify-center h-full text-text-tertiary text-sm">Loading...</div>
			{:else if previewEmail?.bodyValues}
				<EmailDetail email={previewEmail} compact />
			{:else}
				<div class="flex items-center justify-center h-full text-text-tertiary text-sm">Select an email to read</div>
			{/if}
		</div>
	{/if}
</div>

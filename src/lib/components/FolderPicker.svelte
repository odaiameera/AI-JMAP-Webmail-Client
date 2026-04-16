<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { Mailbox } from '$lib/jmap/types';
	import type { Label } from '$lib/types/labels';
	import { LABEL_PREFIX } from '$lib/types/labels';

	let {
		mailboxes,
		labels = [],
		excludeIds = [],
		onPick,
		onClose
	}: {
		mailboxes: Mailbox[];
		labels?: Label[];
		excludeIds?: string[];
		onPick: (id: string) => void;
		onClose: () => void;
	} = $props();

	type PickerKind = 'system' | 'folder' | 'label';
	interface PickerItem {
		id: string;
		name: string;
		kind: PickerKind;
		role?: string | null;
		color?: string;
		unread: number;
	}

	const roleSort: Record<string, number> = {
		inbox: 0, archive: 1, sent: 2, junk: 3, trash: 4
	};

	const labelById = $derived(new Map(labels.map((l) => [l.id, l])));
	const excludeSet = $derived(new Set(excludeIds));

	const items = $derived.by<PickerItem[]>(() => {
		const list: PickerItem[] = [];
		for (const m of mailboxes) {
			if (excludeSet.has(m.id)) continue;
			// Drafts, Sent Messages, and "sent" role are never a legal target.
			if (m.role === 'drafts') continue;
			if (m.role === 'sent') continue;
			if (m.name === 'Sent Messages') continue;

			if (m.name.startsWith(LABEL_PREFIX)) {
				const lbl = labelById.get(m.id);
				list.push({
					id: m.id,
					name: lbl?.name ?? m.name.slice(LABEL_PREFIX.length),
					kind: 'label',
					color: lbl?.color,
					unread: m.unreadEmails
				});
			} else if (m.role) {
				list.push({
					id: m.id,
					name: m.name,
					kind: 'system',
					role: m.role,
					unread: m.unreadEmails
				});
			} else {
				list.push({
					id: m.id,
					name: m.name,
					kind: 'folder',
					unread: m.unreadEmails
				});
			}
		}

		list.sort((a, b) => {
			// System first (role order), then folders (alphabetical), then labels (alphabetical).
			const kindOrder = { system: 0, folder: 1, label: 2 };
			if (kindOrder[a.kind] !== kindOrder[b.kind]) return kindOrder[a.kind] - kindOrder[b.kind];
			if (a.kind === 'system') {
				const ao = roleSort[a.role ?? ''] ?? 10;
				const bo = roleSort[b.role ?? ''] ?? 10;
				if (ao !== bo) return ao - bo;
			}
			return a.name.localeCompare(b.name);
		});

		return list;
	});

	let query = $state('');
	let highlight = $state(0);
	let listEl = $state<HTMLDivElement | undefined>(undefined);
	let inputEl = $state<HTMLInputElement | undefined>(undefined);
	let rootEl = $state<HTMLDivElement | undefined>(undefined);

	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return items.slice(0, 100);
		return items.filter((i) => i.name.toLowerCase().includes(q)).slice(0, 100);
	});

	// Keep highlight in range when the filter changes.
	$effect(() => {
		filtered;
		if (highlight >= filtered.length) highlight = Math.max(0, filtered.length - 1);
	});

	onMount(() => {
		inputEl?.focus();
	});

	async function scrollHighlightIntoView() {
		await tick();
		const el = listEl?.querySelector<HTMLElement>(`[data-idx="${highlight}"]`);
		el?.scrollIntoView({ block: 'nearest' });
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			onClose();
			return;
		}
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			highlight = Math.min(filtered.length - 1, highlight + 1);
			scrollHighlightIntoView();
			return;
		}
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			highlight = Math.max(0, highlight - 1);
			scrollHighlightIntoView();
			return;
		}
		if (e.key === 'Enter') {
			e.preventDefault();
			const item = filtered[highlight];
			if (item) onPick(item.id);
			return;
		}
	}

	function handleWindowClick(e: MouseEvent) {
		if (!rootEl) return;
		if (!rootEl.contains(e.target as Node)) onClose();
	}

	function iconFor(item: PickerItem): string {
		if (item.kind === 'system') {
			switch (item.role) {
				case 'inbox': return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>`;
				case 'trash': return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>`;
				case 'junk': return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
				case 'archive': return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`;
			}
		}
		return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>`;
	}
</script>

<svelte:window onkeydown={handleKeydown} onclick={handleWindowClick} />

<div
	bind:this={rootEl}
	class="w-[280px] bg-surface border border-border rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden animate-compose-modal-in"
	role="dialog"
	aria-label="Move to folder"
>
	<div class="px-2 py-2 border-b border-border">
		<div class="relative">
			<svg
				class="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none"
				width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
			>
				<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/>
			</svg>
			<input
				bind:this={inputEl}
				bind:value={query}
				placeholder="Move to folder or label…"
				class="w-full bg-surface-hover border border-border rounded-lg pl-7 pr-2 py-1.5 text-sm text-text placeholder-text-tertiary outline-none focus:border-accent transition-colors"
			/>
		</div>
	</div>

	<div bind:this={listEl} class="max-h-[300px] overflow-y-auto py-1">
		{#if filtered.length === 0}
			<p class="px-3 py-6 text-xs text-text-tertiary text-center">No matches</p>
		{:else}
			{#each filtered as item, i (item.id)}
				<button
					data-idx={i}
					onclick={() => onPick(item.id)}
					onmouseenter={() => { highlight = i; }}
					class="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors cursor-pointer
						{highlight === i ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:bg-surface-hover hover:text-text'}"
				>
					{#if item.kind === 'label'}
						<span class="w-3 h-3 rounded-full shrink-0 border border-white/20" style="background-color: {item.color ?? '#6366F1'}"></span>
					{:else}
						<span class="w-3.5 h-3.5 shrink-0 flex items-center justify-center text-current">{@html iconFor(item)}</span>
					{/if}
					<span class="flex-1 truncate">{item.name}</span>
					{#if item.unread > 0}
						<span class="text-[10px] font-medium text-text-tertiary shrink-0">{item.unread}</span>
					{/if}
				</button>
			{/each}
		{/if}
	</div>
</div>

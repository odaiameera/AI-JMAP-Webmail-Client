<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { page } from '$app/state';
	import { moveToCategory } from '$lib/categories/api';
	import {
		INBOX_CATEGORIES,
		inboxTabHref,
		type InboxCategory,
		type InboxTabsState
	} from '$lib/types/categories';
	import { CATEGORY_ICON } from './category-icons';

	let { tabs }: { tabs: InboxTabsState } = $props();

	// Rows are dragged with the same payload the sidebar folders accept, so a
	// tab is just one more drop target: dropping sets the category.
	const EMAIL_DRAG_TYPE = 'application/x-email-ids';
	let dragOver = $state<InboxCategory | null>(null);

	function hasEmailPayload(e: DragEvent): boolean {
		return !!e.dataTransfer?.types?.includes(EMAIL_DRAG_TYPE);
	}

	function onDragOver(e: DragEvent, key: InboxCategory) {
		if (!hasEmailPayload(e) || key === tabs.active) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		dragOver = key;
	}

	function onDragLeave(e: DragEvent, key: InboxCategory) {
		const related = e.relatedTarget as Node | null;
		if (related && (e.currentTarget as Node).contains(related)) return;
		if (dragOver === key) dragOver = null;
	}

	async function onDrop(e: DragEvent, key: InboxCategory) {
		if (!hasEmailPayload(e)) return;
		e.preventDefault();
		dragOver = null;
		let ids: unknown;
		try {
			ids = JSON.parse(e.dataTransfer?.getData(EMAIL_DRAG_TYPE) ?? '');
		} catch {
			return;
		}
		if (!Array.isArray(ids) || ids.length === 0) return;
		// The list only ever shows the active tab's mail, so that is where
		// every dragged row came from — which is what Undo needs.
		await moveToCategory(ids as string[], key, tabs.active);
	}

	function formatCount(n: number): string {
		return n > 999 ? '999+' : String(n);
	}
</script>

<!--
	The list column is often narrower than four labelled tabs (420px by
	default beside the reading pane), so below ~36rem the inactive tabs
	collapse to icon + count and only the active tab keeps its label. The
	label stays in the accessibility tree either way, and in the tooltip.
-->
<nav
	aria-label="Inbox tabs"
	class="@container border-b border-border shrink-0"
>
	<div class="flex items-stretch gap-0.5 px-2 overflow-x-auto [scrollbar-width:none]">
		{#each INBOX_CATEGORIES as c (c.key)}
			{@const active = tabs.active === c.key}
			{@const unread = tabs.unread[c.key]}
			<a
				href={inboxTabHref(page.url, c.key)}
				title={c.description}
				aria-current={active ? 'page' : undefined}
				ondragover={(e) => onDragOver(e, c.key)}
				ondragleave={(e) => onDragLeave(e, c.key)}
				ondrop={(e) => onDrop(e, c.key)}
				class="relative flex items-center gap-1.5 px-2.5 py-2 my-1 rounded-md text-sm whitespace-nowrap no-underline transition-colors
					{dragOver === c.key
						? 'bg-accent/10 text-accent-fg ring-1 ring-accent'
						: active
							? 'text-text font-semibold'
							: 'text-text-secondary hover:text-text hover:bg-surface-hover'}"
			>
				<span class="shrink-0 {active ? 'text-text' : 'text-text-tertiary'}"><Icon name={CATEGORY_ICON[c.key]} size={16} /></span>
				<span class={active ? '' : 'sr-only @xl:not-sr-only'}>{c.label}</span>
				{#if unread > 0}
					<span
						class="rounded-full px-1.5 py-px text-2xs font-medium tabular-nums
							{active ? 'bg-accent text-white' : 'bg-surface-hover text-text-secondary'}"
						aria-label="{unread} unread"
					>
						{formatCount(unread)}
					</span>
				{/if}
				{#if active}
					<span class="absolute left-2 right-2 -bottom-1 h-0.5 rounded-full bg-accent" aria-hidden="true"></span>
				{/if}
			</a>
		{/each}
	</div>
</nav>

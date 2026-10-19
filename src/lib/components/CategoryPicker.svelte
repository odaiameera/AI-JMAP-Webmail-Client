<script lang="ts">
	import { onMount } from 'svelte';
	import { INBOX_CATEGORIES, type InboxCategory } from '$lib/types/categories';
	import { categoryIcon } from './category-icons';

	let {
		current = null,
		anchor,
		align = 'right',
		onPick,
		onClose
	}: {
		/** The tab the message is in now; null for a mixed selection. */
		current?: InboxCategory | null;
		/** The trigger button — the menu is placed against it. */
		anchor: HTMLElement | null;
		/** Which edge of the trigger the menu lines up with. */
		align?: 'left' | 'right';
		onPick: (category: InboxCategory) => void;
		onClose: () => void;
	} = $props();

	// Fixed to the viewport and moved onto <body>, like FolderPicker: the
	// triggers live inside the list column (overflow hidden) and its
	// scroller, either of which would clip an absolutely placed menu, and
	// under the sticky date headers further down the list.
	const WIDTH = 256;
	const GAP = 4;
	let rootEl = $state<HTMLDivElement | undefined>(undefined);
	let top = $state(0);
	let left = $state(0);
	let positioned = $state(false);

	function computePosition() {
		if (!anchor) return;
		const rect = anchor.getBoundingClientRect();
		const height = rootEl?.offsetHeight ?? 0;
		const nextLeft = align === 'right' ? rect.right - WIDTH : rect.left;
		left = Math.max(8, Math.min(nextLeft, window.innerWidth - WIDTH - 8));
		// Below the trigger, or above it when the bottom of the window is too close.
		const fitsBelow = rect.bottom + GAP + height + 8 <= window.innerHeight;
		top = fitsBelow || rect.top < height + GAP + 8 ? rect.bottom + GAP : rect.top - height - GAP;
		positioned = true;
	}

	onMount(() => {
		computePosition();
		const reposition = () => computePosition();
		window.addEventListener('scroll', reposition, true);
		window.addEventListener('resize', reposition);
		return () => {
			window.removeEventListener('scroll', reposition, true);
			window.removeEventListener('resize', reposition);
		};
	});

	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return {
			destroy() {
				node.remove();
			}
		};
	}

	function handleWindowClick(e: MouseEvent) {
		const target = e.target as Node;
		if (rootEl?.contains(target)) return;
		// The trigger toggles the menu itself.
		if (anchor?.contains(target)) return;
		onClose();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleKeydown} />

<div
	use:portal
	bind:this={rootEl}
	role="menu"
	aria-label="Move to tab"
	class="fixed z-[60] bg-surface border border-border rounded-lg shadow-xl py-1"
	style="width: {WIDTH}px; top: {top}px; left: {left}px; visibility: {positioned ? 'visible' : 'hidden'};"
>
	<div class="px-3 py-1.5 text-3xs uppercase tracking-wider text-text-tertiary font-semibold">
		Move to tab
	</div>
	{#each INBOX_CATEGORIES as c (c.key)}
		<button
			type="button"
			role="menuitemradio"
			aria-checked={current === c.key}
			onclick={() => onPick(c.key)}
			class="w-full text-left px-3 py-2 text-xs hover:bg-surface-hover cursor-pointer flex items-start gap-2.5
				{current === c.key ? 'text-accent-fg' : 'text-text'}"
		>
			<span class="mt-px shrink-0 {current === c.key ? '' : 'text-text-secondary'}">{@html categoryIcon(c.key, 14)}</span>
			<span class="flex-1 min-w-0">
				<span class="block font-medium">{c.label}</span>
				<span class="block text-text-tertiary mt-0.5">{c.description}</span>
			</span>
			{#if current === c.key}
				<svg class="mt-px shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
			{/if}
		</button>
	{/each}
</div>

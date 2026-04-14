<script lang="ts">
	import Sidebar from '$lib/components/Sidebar.svelte';
	import AppRail from '$lib/components/AppRail.svelte';
	import ComposeModal from '$lib/components/ComposeModal.svelte';
	import FullComposer from '$lib/components/FullComposer.svelte';
	import { fullComposeOpen } from '$lib/stores/compose';
	import { goto } from '$app/navigation';
	import { onMount, setContext } from 'svelte';
	import { createReadingPaneStore } from '$lib/stores/readingPane';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: any } = $props();

	// eslint-disable-next-line -- intentionally capturing initial values from server cookies
	let { readingPaneDefault, theme: initialTheme } = data;
	const readingPane = createReadingPaneStore(readingPaneDefault);
	setContext('readingPane', readingPane);

	let searchQuery = $state('');
	let searchFocused = $state(false);
	let activeFilters = $state(new Set(['from', 'to', 'subject', 'body']));

	onMount(() => {
		const handler = () => readingPane.setFromViewport(window.innerWidth);
		window.addEventListener('resize', handler);
		return () => window.removeEventListener('resize', handler);
	});

	function toggleFilter(f: string) {
		const next = new Set(activeFilters);
		if (next.has(f)) {
			if (next.size > 1) next.delete(f);
		} else {
			next.add(f);
		}
		activeFilters = next;
	}

	function handleSearch(e?: Event) {
		e?.preventDefault();
		if (!searchQuery.trim()) return;
		const params = new URLSearchParams({
			q: searchQuery.trim(),
			in: [...activeFilters].join(',')
		});
		goto(`/search?${params}`);
		searchFocused = false;
	}
</script>

<div class="flex flex-col h-screen overflow-hidden bg-bg">
	<!-- Search bar -->
	<div class="shrink-0 border-b border-border px-4 py-2">
		<form onsubmit={handleSearch} class="max-w-[600px] mx-auto">
			<input
				type="text"
				bind:value={searchQuery}
				onfocus={() => searchFocused = true}
				onblur={() => setTimeout(() => searchFocused = false, 200)}
				placeholder="Search mail..."
				class="w-full bg-surface border border-border rounded-lg px-3.5 py-2 text-sm text-text placeholder-text-tertiary
					focus:outline-none focus:ring-1 focus:ring-accent/50 focus:border-accent transition-colors"
			/>
			{#if searchFocused || searchQuery}
				<div class="flex items-center gap-1.5 mt-1.5">
					{#each ['from', 'to', 'subject', 'body'] as filter}
						<button
							type="button"
							onmousedown={(e) => { e.preventDefault(); toggleFilter(filter); }}
							class="px-2 py-0.5 rounded text-xs transition-colors cursor-pointer
								{activeFilters.has(filter)
									? 'bg-accent/15 text-accent'
									: 'text-text-tertiary hover:text-text-secondary'}"
						>
							{filter.charAt(0).toUpperCase() + filter.slice(1)}
						</button>
					{/each}
				</div>
			{/if}
		</form>
	</div>

	<div class="flex flex-1 overflow-hidden">
		<AppRail initialTheme={initialTheme} />
		<Sidebar mailboxes={data.mailboxes} />
		<main class="flex-1 overflow-hidden min-w-0">
			{@render children()}
		</main>
		{#if $fullComposeOpen}
			<div class="w-[600px] border-l border-border flex flex-col shrink-0">
				<FullComposer />
			</div>
		{/if}
	</div>
</div>

<ComposeModal />

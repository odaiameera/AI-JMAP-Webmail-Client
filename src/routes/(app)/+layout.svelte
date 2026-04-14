<script lang="ts">
	import Sidebar from '$lib/components/Sidebar.svelte';
	import ComposeModal from '$lib/components/ComposeModal.svelte';
	import { goto } from '$app/navigation';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: any } = $props();

	let searchQuery = $state('');
	let searchFocused = $state(false);
	let activeFilters = $state(new Set(['from', 'to', 'subject', 'body']));

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
		<Sidebar mailboxes={data.mailboxes} />
		<main class="flex-1 overflow-y-auto">
			{@render children()}
		</main>
	</div>
</div>

<ComposeModal />

<script lang="ts">
	import Sidebar from '$lib/components/Sidebar.svelte';
	import AppRail from '$lib/components/AppRail.svelte';
	import ComposeModal from '$lib/components/ComposeModal.svelte';
	import SettingsIsland from '$lib/components/SettingsIsland.svelte';
	import { goto } from '$app/navigation';
	import { onMount, setContext } from 'svelte';
	import { createReadingPaneStore } from '$lib/stores/readingPane';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: any } = $props();

	// eslint-disable-next-line -- intentionally capturing initial values from server cookies
	let { readingPaneDefault, theme: initialTheme } = data;
	const readingPane = createReadingPaneStore(readingPaneDefault);
	setContext('readingPane', readingPane);
	setContext('userSignature', data.signature ?? '');
	setContext('labels', data.labels ?? []);
	setContext('rules', data.rules ?? []);

	let searchQuery = $state('');
	let searchFocused = $state(false);
	let activeFilters = $state(new Set(['from', 'to', 'subject', 'body']));
	let settingsOpen = $state(false);
	let settingsEl = $state<HTMLDivElement | undefined>(undefined);

	const avatarLetter = $derived((data.displayName ?? 'O')[0].toUpperCase());

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

	function handleClickOutside(e: MouseEvent) {
		if (settingsOpen && settingsEl && !settingsEl.contains(e.target as Node)) {
			settingsOpen = false;
		}
	}
</script>

<svelte:window onclick={handleClickOutside} />

<div class="h-screen overflow-hidden bg-surface grid grid-cols-[auto_1fr_auto] grid-rows-[auto_1fr]">
	<!-- Row 1, Col 1: Sidebar logo -->
	<div class="px-4 flex items-center h-14">
		<h1 class="text-lg font-bold text-text tracking-tight leading-none">ameera.</h1>
	</div>

	<!-- Row 1, Col 2+3: Search + Name + Settings + Profile -->
	<div class="col-span-2 flex items-center px-5 gap-3">
		<form onsubmit={handleSearch} class="relative w-[420px]">
			<input
				type="text"
				bind:value={searchQuery}
				onfocus={() => searchFocused = true}
				onblur={() => setTimeout(() => searchFocused = false, 200)}
				placeholder="Search mail..."
				class="w-full bg-bg/50 border border-border rounded-lg px-3.5 py-1.5 text-sm text-text placeholder-text-tertiary
					focus:outline-none focus:ring-1 focus:ring-accent/50 focus:border-accent transition-colors"
			/>
			{#if searchFocused || searchQuery}
				<div class="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded-lg p-2 flex items-center gap-1.5 z-10">
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
		<div class="flex-1"></div>
		<span class="text-sm text-text-secondary select-none">{data.displayName}</span>
		<div class="w-px h-5 bg-border shrink-0"></div>
		<div class="w-9 h-9 rounded-full bg-accent text-white flex items-center justify-center text-sm font-semibold select-none shrink-0" title="Profile">
			{avatarLetter}
		</div>
	</div>

	<!-- Row 2, Col 1: Sidebar -->
	<Sidebar mailboxes={data.mailboxes} hideHeader={true} />

	<!-- Row 2, Col 2: Main content (inset with rounded corners) -->
	<main class="overflow-hidden min-w-0 bg-bg rounded-tl-xl rounded-tr-xl">
		{@render children()}
	</main>

	<!-- Row 2, Col 3: App rail -->
	<AppRail initialTheme={initialTheme} settingsOpen={settingsOpen} onToggleSettings={() => { settingsOpen = !settingsOpen; }} />
</div>

{#if settingsOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="fixed inset-0 bg-black/40 z-40 animate-compose-backdrop-in" onclick={() => settingsOpen = false}></div>
	<div bind:this={settingsEl} onclick={(e) => e.stopPropagation()}>
		<SettingsIsland
			onClose={() => settingsOpen = false}
			initialTheme={initialTheme}
			displayName={data.displayName}
			signature={data.signature}
			labels={data.labels ?? []}
			rules={data.rules ?? []}
			mailboxes={data.mailboxes}
		/>
	</div>
{/if}

<ComposeModal />

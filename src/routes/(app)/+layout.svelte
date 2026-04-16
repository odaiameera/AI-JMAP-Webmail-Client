<script lang="ts">
	import Sidebar from '$lib/components/Sidebar.svelte';
	import AppRail from '$lib/components/AppRail.svelte';
	import ComposeModal from '$lib/components/ComposeModal.svelte';
	import SettingsIsland from '$lib/components/SettingsIsland.svelte';
	import ProfileCard from '$lib/components/ProfileCard.svelte';
	import { goto } from '$app/navigation';
	import { onMount, setContext } from 'svelte';
	import { createReadingPaneStore } from '$lib/stores/readingPane';
	import { profilePhoto } from '$lib/stores/profilePhoto';
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
	let profileOpen = $state(false);
	let profileCardEl = $state<HTMLDivElement | undefined>(undefined);
	let sidebarCollapsed = $state(false);

	const avatarLetter = $derived((data.displayName ?? 'O')[0].toUpperCase());
	const sidebarWidth = $derived(sidebarCollapsed ? '48px' : '224px');

	onMount(() => {
		profilePhoto.hydrate();
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
		if (profileOpen && profileCardEl && !profileCardEl.contains(e.target as Node)) {
			profileOpen = false;
		}
	}
</script>

<svelte:window onclick={handleClickOutside} />

<div
	class="h-screen overflow-hidden bg-surface grid grid-rows-[auto_1fr]"
	style="grid-template-columns: {sidebarWidth} 1fr auto; transition: grid-template-columns 0.2s ease;"
>
	<!-- Row 1: Full-width header -->
	<div class="col-span-3 flex items-center h-14 pl-4 pr-0 gap-4">
		<h1 class="text-lg font-bold text-text tracking-tight leading-none shrink-0 {sidebarCollapsed ? 'w-4' : 'w-[192px]'} transition-all duration-200 overflow-hidden whitespace-nowrap">
			{sidebarCollapsed ? '' : 'ameera.'}
		</h1>
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
		<!-- 52px wrapper aligns avatar center with the AppRail column below -->
		<div class="w-[52px] shrink-0 flex items-center justify-center">
			<button
				onclick={(e) => { e.stopPropagation(); profileOpen = !profileOpen; }}
				class="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-xs font-semibold select-none shrink-0 cursor-pointer hover:ring-2 hover:ring-accent/50 transition-shadow overflow-hidden"
				title="Profile"
			>
				{#if $profilePhoto.url}
					<img
						src={$profilePhoto.url}
						alt="Profile"
						class="w-full h-full object-cover origin-center pointer-events-none select-none"
						style="transform: translate({$profilePhoto.offsetX * (32 / 80)}px, {$profilePhoto.offsetY * (32 / 80)}px) scale({$profilePhoto.zoom});"
						draggable="false"
					/>
				{:else}
					{avatarLetter}
				{/if}
			</button>
		</div>
	</div>

	<!-- Row 2, Col 1: Sidebar -->
	<Sidebar mailboxes={data.mailboxes} hideHeader={true} collapsed={sidebarCollapsed} onToggleCollapse={() => { sidebarCollapsed = !sidebarCollapsed; }} />

	<!-- Row 2, Col 2: Main content -->
	<main class="overflow-hidden min-w-0 bg-bg rounded-tl-xl rounded-tr-xl">
		{@render children()}
	</main>

	<!-- Row 2, Col 3: App rail -->
	<AppRail initialTheme={initialTheme} settingsOpen={settingsOpen} onToggleSettings={() => { settingsOpen = !settingsOpen; }} />
</div>

{#if profileOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div bind:this={profileCardEl} class="fixed z-50" style="top: 56px; right: 64px;" onclick={(e) => e.stopPropagation()}>
		<ProfileCard
			displayName={data.displayName}
			email={data.userEmail}
			onClose={() => { profileOpen = false; }}
		/>
	</div>
{/if}

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

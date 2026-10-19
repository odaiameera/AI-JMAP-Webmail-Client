<script lang="ts">
	import { page } from '$app/state';
	import { pageTitle } from '$lib/utils/title';
	import {
		SETTINGS_NAV,
		SETTINGS_GROUP_ORDER,
		type SettingsNavGroup,
		type SettingsNavItem
	} from '$lib/config/settings-nav';
	import { hostAppPanel } from '$lib/app-panel';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	const grouped = $derived.by(() => {
		const map = new Map<SettingsNavGroup, SettingsNavItem[]>();
		for (const item of SETTINGS_NAV) {
			const list = map.get(item.group) ?? [];
			list.push(item);
			map.set(item.group, list);
		}
		return SETTINGS_GROUP_ORDER
			.filter((g) => map.has(g))
			.map((g) => [g, map.get(g)!] as const);
	});

	function isActive(slug: string): boolean {
		return page.url.pathname === `/settings/${slug}`;
	}

	// The section list lives in the shell's left column — in place of the
	// mail folders, not beside them — and in the drawer on phones.
	const hosted = hostAppPanel(settingsNav);
</script>

<svelte:head><title>{pageTitle({ page: 'Settings' })}</title></svelte:head>

{#snippet settingsNav()}
	<nav class="flex-1 min-h-0 overflow-y-auto px-2 pt-1.5 pb-3" aria-label="Settings">
		<!-- Same height and offset as Compose in the mail sidebar, so the first
		     row lines up with the top bars of the panes beside it. -->
		<a
			href="/inbox"
			class="flex items-center gap-2 h-9 px-3 rounded-lg text-sm text-text-secondary hover:bg-surface-hover hover:text-text transition-colors"
		>
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<line x1="19" y1="12" x2="5" y2="12"/>
				<polyline points="12 19 5 12 12 5"/>
			</svg>
			<span>Back to Inbox</span>
		</a>
		{#each grouped as [group, list] (group)}
			<p class="text-3xs font-semibold uppercase tracking-wider text-text-tertiary px-3 pt-4 pb-1">{group}</p>
			{#each list as item (item.slug)}
				<a
					href="/settings/{item.slug}"
					aria-current={isActive(item.slug) ? 'page' : undefined}
					class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors
						{isActive(item.slug)
							? 'bg-accent/10 text-accent-fg'
							: 'text-text-secondary hover:bg-surface-hover hover:text-text'}"
				>
					<span class="flex-1 truncate">{item.label}</span>
				</a>
			{/each}
		{/each}
	</nav>
{/snippet}

<div class="h-full flex min-h-0 overflow-hidden">
	{#if !hosted}
		<aside class="w-[224px] shrink-0 border-r border-border flex flex-col">{@render settingsNav()}</aside>
	{/if}
	<section class="flex-1 min-h-0 overflow-y-auto">
		<div class="px-8 py-6 max-md:px-4 max-md:py-4 max-w-3xl">
			{@render children()}
		</div>
	</section>
</div>

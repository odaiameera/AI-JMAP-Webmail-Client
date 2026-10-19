<script lang="ts">
	import { page } from '$app/state';
	import { pageTitle } from '$lib/utils/title';
	import {
		SETTINGS_NAV,
		SETTINGS_GROUP_ORDER,
		type SettingsNavGroup,
		type SettingsNavItem
	} from '$lib/config/settings-nav';
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

	// On phones the nav is a horizontal strip, so the current page can sit
	// off-screen to the right; bring it into view on every navigation.
	let navEl = $state<HTMLElement | undefined>(undefined);
	$effect(() => {
		void page.url.pathname;
		navEl?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	});
</script>

<svelte:head><title>{pageTitle({ page: 'Settings' })}</title></svelte:head>

<!-- Side-by-side from `md` up. On phones the nav becomes a scrolling row of
     chips above the page, without the group headings or Back link (the tab
     bar already gets you back to mail). -->
<div class="h-full flex max-md:flex-col min-h-0 overflow-hidden">
	<!-- Nav -->
	<aside class="w-[240px] shrink-0 border-r border-border overflow-y-auto flex flex-col max-md:w-full max-md:border-r-0 max-md:border-b">
		<div class="px-3 py-3 border-b border-border max-md:hidden">
			<a
				href="/inbox"
				class="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-text-secondary hover:bg-surface-hover hover:text-text transition-colors"
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<line x1="19" y1="12" x2="5" y2="12"/>
					<polyline points="12 19 5 12 12 5"/>
				</svg>
				<span>Back to Inbox</span>
			</a>
		</div>

		<nav bind:this={navEl} class="flex-1 overflow-y-auto py-2 px-2 max-md:flex max-md:gap-1 max-md:overflow-x-auto max-md:overflow-y-hidden">
			{#each grouped as [group, list] (group)}
				<p class="text-3xs font-semibold uppercase tracking-wider text-text-tertiary px-3 pt-3 pb-1 max-md:hidden">{group}</p>
				{#each list as item (item.slug)}
					<a
						href="/settings/{item.slug}"
						aria-current={isActive(item.slug) ? 'page' : undefined}
						class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all border-l-2 max-md:shrink-0 max-md:border-l-0 max-md:whitespace-nowrap
							{isActive(item.slug)
								? 'bg-accent/10 text-accent-fg border-l-accent'
								: 'text-text-secondary hover:bg-surface-hover hover:text-text border-l-transparent'}"
					>
						<span class="flex-1 truncate">{item.label}</span>
					</a>
				{/each}
			{/each}
		</nav>
	</aside>

	<!-- Section content -->
	<section class="flex-1 min-h-0 overflow-y-auto">
		<div class="px-8 py-6 max-md:px-4 max-md:py-4 max-w-3xl">
			{@render children()}
		</div>
	</section>
</div>

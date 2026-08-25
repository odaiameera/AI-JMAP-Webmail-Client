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
</script>

<svelte:head><title>{pageTitle({ page: 'Settings' })}</title></svelte:head>

<div class="h-full flex min-h-0 overflow-hidden">
	<!-- Nav -->
	<aside class="w-[240px] shrink-0 border-r border-border overflow-y-auto flex flex-col">
		<div class="px-3 py-3 border-b border-border">
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

		<nav class="flex-1 overflow-y-auto py-2 px-2">
			{#each grouped as [group, list] (group)}
				<p class="text-3xs font-semibold uppercase tracking-wider text-text-tertiary px-3 pt-3 pb-1">{group}</p>
				{#each list as item (item.slug)}
					<a
						href="/settings/{item.slug}"
						class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all border-l-2
							{isActive(item.slug)
								? 'bg-accent/10 text-accent border-l-accent'
								: 'text-text-secondary hover:bg-surface-hover hover:text-text border-l-transparent'}"
					>
						<span class="flex-1 truncate">{item.label}</span>
					</a>
				{/each}
			{/each}
		</nav>
	</aside>

	<!-- Section content -->
	<section class="flex-1 overflow-y-auto">
		<div class="px-8 py-6 max-w-3xl">
			{@render children()}
		</div>
	</section>
</div>

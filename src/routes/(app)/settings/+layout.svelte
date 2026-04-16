<script lang="ts">
	import { page } from '$app/state';
	import { pageTitle } from '$lib/utils/title';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	interface NavItem {
		slug: string;
		label: string;
		group: string;
		tags: string;
		external?: boolean;
		href?: string;
	}

	const items = $derived<NavItem[]>([
		{ slug: 'account',      group: 'Account',      label: 'Account',       tags: 'profile display name signature identity email' },
		{
			slug: 'security',
			group: 'Account',
			label: 'Security',
			tags: 'password 2fa totp passkey app passwords webauthn',
			external: true,
			href: data.stalwartPortalUrl
		},

		{ slug: 'appearance',   group: 'Mail',         label: 'Appearance',    tags: 'theme dark light density layout reading pane' },
		{ slug: 'mail',         group: 'Mail',         label: 'Mail',          tags: 'conversation sort read delay images keyboard shortcut' },
		{ slug: 'composer',     group: 'Mail',         label: 'Composer',      tags: 'font size undo send draft autosave signature' },
		{ slug: 'notifications',group: 'Mail',         label: 'Notifications', tags: 'push browser alert sound' },
		{ slug: 'auto-reply',   group: 'Mail',         label: 'Auto-reply',    tags: 'vacation out of office responder' },

		{ slug: 'folders',      group: 'Organization', label: 'Folders',       tags: 'folder tree hierarchy' },
		{ slug: 'labels',       group: 'Organization', label: 'Labels',        tags: 'labels colors tags' },
		{ slug: 'rules',        group: 'Organization', label: 'Filters & Rules', tags: 'rules filters sieve automation' },

		{ slug: 'advanced',     group: 'Advanced',     label: 'Advanced',      tags: 'export import reset backup restore defaults' }
	]);

	let query = $state('');

	const filteredItems = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return items;
		return items.filter((i) =>
			i.label.toLowerCase().includes(q) || i.tags.toLowerCase().includes(q)
		);
	});

	const grouped = $derived.by(() => {
		const map = new Map<string, NavItem[]>();
		for (const item of filteredItems) {
			const list = map.get(item.group) ?? [];
			list.push(item);
			map.set(item.group, list);
		}
		return [...map.entries()];
	});

	function isActive(slug: string): boolean {
		return page.url.pathname === `/settings/${slug}`;
	}
</script>

<svelte:head><title>{pageTitle({ page: 'Settings' })}</title></svelte:head>

<div class="h-full flex flex-col overflow-hidden">
	<header class="px-6 py-4 border-b border-border flex items-center gap-3 shrink-0">
		<a href="/inbox" class="text-sm text-text-tertiary hover:text-text transition-colors">&larr; Inbox</a>
		<div class="w-px h-5 bg-border"></div>
		<h1 class="text-lg font-semibold text-text">Settings</h1>
	</header>

	<div class="flex-1 flex min-h-0 overflow-hidden">
		<!-- Nav -->
		<aside class="w-[240px] shrink-0 border-r border-border overflow-y-auto flex flex-col">
			<div class="px-3 py-3 border-b border-border">
				<div class="relative">
					<svg class="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/>
					</svg>
					<input
						bind:value={query}
						placeholder="Search settings…"
						class="w-full bg-surface-hover border border-border rounded-lg pl-7 pr-2 py-1.5 text-xs text-text placeholder-text-tertiary outline-none focus:border-accent"
					/>
				</div>
			</div>

			<nav class="flex-1 overflow-y-auto py-2 px-2">
				{#each grouped as [group, list]}
					<p class="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary px-3 pt-3 pb-1">{group}</p>
					{#each list as item (item.slug)}
						{#if item.external}
							<a
								href={item.href}
								target="_blank"
								rel="noopener noreferrer"
								class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-text-secondary hover:bg-surface-hover hover:text-text transition-colors"
							>
								<span class="flex-1 truncate">{item.label}</span>
								<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-text-tertiary shrink-0"><path d="M7 17L17 7"/><polyline points="7 7 17 7 17 17"/></svg>
							</a>
						{:else}
							<a
								href="/settings/{item.slug}"
								class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all border-l-2
									{isActive(item.slug)
										? 'bg-accent/10 text-accent border-l-accent'
										: 'text-text-secondary hover:bg-surface-hover hover:text-text border-l-transparent'}"
							>
								<span class="flex-1 truncate">{item.label}</span>
							</a>
						{/if}
					{/each}
				{/each}
				{#if filteredItems.length === 0}
					<p class="px-3 py-6 text-xs text-text-tertiary text-center">No matches for "{query}"</p>
				{/if}
			</nav>
		</aside>

		<!-- Section content -->
		<section class="flex-1 overflow-y-auto">
			<div class="px-8 py-6 max-w-3xl">
				{@render children()}
			</div>
		</section>
	</div>
</div>

<script lang="ts">
	import { page } from '$app/state';

	type RailItem = {
		id: string;
		label: string;
		href: string;
		icon: string; // inline SVG
	};

	let { settingsOpen = false, onToggleSettings }: {
		settingsOpen?: boolean;
		onToggleSettings?: () => void;
	} = $props();

	// All icons share the same visual language: 20×20, stroke-width 1.75,
	// no fill, round linecaps/joins, currentColor stroke.
	const items: RailItem[] = [
		{
			id: 'mail',
			label: 'Mail',
			href: '/inbox',
			icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><polyline points="22 6 12 13 2 6"/></svg>`
		},
		{
			id: 'ai',
			label: 'AI',
			href: '/apps/ai',
			icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/></svg>`
		},
		{
			id: 'contacts',
			label: 'Contacts',
			href: '/apps/contacts',
			icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`
		},
		{
			id: 'tasks',
			label: 'Tasks',
			href: '/apps/tasks',
			icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>`
		},
		{
			id: 'calendar',
			label: 'Calendar',
			href: '/apps/calendar',
			icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`
		}
	];

	function isActive(href: string): boolean {
		const path = page.url.pathname;
		if (href === '/inbox') {
			return (
				path.startsWith('/inbox') ||
				path.startsWith('/folder') ||
				path.startsWith('/email') ||
				path.startsWith('/search')
			);
		}
		return path.startsWith(href);
	}
</script>

<div class="w-[52px] shrink-0 bg-surface flex flex-col items-center py-3 gap-1 overflow-hidden">
	{#each items as item (item.id)}
		<a
			href={item.href}
			title={item.label}
			aria-label={item.label}
			aria-current={isActive(item.href) ? 'page' : undefined}
			class="w-9 h-9 rounded-lg flex items-center justify-center transition-colors cursor-pointer
				{isActive(item.href)
					? 'text-accent bg-accent/10'
					: 'text-text-tertiary hover:text-text hover:bg-surface-hover'}"
		>
			{@html item.icon}
		</a>
	{/each}

	<!-- Spacer pushes Settings to the bottom of the rail -->
	<div class="flex-1"></div>

	<!-- Separator -->
	<div class="h-px w-6 bg-border/30 my-1"></div>

	<!-- Settings (toggle, not a link) -->
	<button
		onclick={(e) => { e.stopPropagation(); onToggleSettings?.(); }}
		title="Settings"
		aria-label="Settings"
		aria-expanded={settingsOpen}
		class="w-9 h-9 rounded-lg flex items-center justify-center transition-colors cursor-pointer
			{settingsOpen
				? 'text-accent bg-accent/10'
				: 'text-text-tertiary hover:text-text hover:bg-surface-hover'}"
	>
		<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
			<circle cx="12" cy="12" r="3"/>
			<path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
		</svg>
	</button>
</div>

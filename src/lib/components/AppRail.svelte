<script lang="ts">
	import { page } from '$app/state';

	type RailItem = {
		id: string;
		label: string;
		href?: string;
		icon: string; // inline SVG
		/** Routes to the /apps placeholder rather than a built feature. Dims the
		 *  icon and says so in the tooltip, so the rail doesn't promise a screen
		 *  that isn't there yet. */
		comingSoon?: boolean;
	};

	let {
		aiOpen = false,
		aiEnabled = false,
		onToggleAI = () => {}
	}: {
		aiOpen?: boolean;
		aiEnabled?: boolean;
		onToggleAI?: () => void;
	} = $props();

	const SETTINGS_HREF = '/settings/account';

	// All icons share the same visual language: 20×20, stroke-width 1.75,
	// no fill, round linecaps/joins, currentColor stroke.
	// Order is deliberate: AI first (it acts across everything below it), then
	// the three built surfaces in the order they get used, then what isn't built.
	const items: RailItem[] = [
		{
			id: 'ai',
			label: 'AI mail agent',
			// Robot head — head rect centred on (12, 14), antenna + ears keep the
			// overall visual centre on viewBox centre (12, 12).
			icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>`
		},
		{
			id: 'mail',
			label: 'Mail',
			href: '/inbox',
			icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><polyline points="22 6 12 13 2 6"/></svg>`
		},
		{
			id: 'calendar',
			label: 'Calendar',
			href: '/calendar',
			icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`
		},
		{
			id: 'contacts',
			label: 'Contacts',
			href: '/contacts',
			icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`
		},
		{
			id: 'tasks',
			label: 'Tasks',
			href: '/apps/tasks',
			comingSoon: true,
			icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>`
		}
	];

	function isActive(href?: string): boolean {
		if (!href) return false;
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

	const settingsActive = $derived(page.url.pathname.startsWith('/settings'));
</script>

<div class="w-[52px] shrink-0 bg-surface flex flex-col items-center py-3 gap-1 overflow-hidden">
	{#each items as item (item.id)}
		{#if item.id === 'ai'}
			<button
				type="button"
				title={aiEnabled ? (aiOpen ? 'Close AI mail agent' : 'Open AI mail agent') : 'AI mail agent is not configured'}
				aria-label={aiOpen ? 'Close AI mail agent' : 'Open AI mail agent'}
				aria-pressed={aiOpen}
				onclick={onToggleAI}
				class="w-9 h-9 rounded-lg flex items-center justify-center transition-all cursor-pointer
					{aiOpen
						? 'text-accent-fg bg-accent/10 shadow-sm'
						: 'text-text-tertiary hover:text-text hover:bg-surface-hover'}"
			>
				{@html item.icon}
			</button>
		{:else}
			<a
				href={item.href}
				title={item.comingSoon ? `${item.label} (coming soon)` : item.label}
				aria-label={item.comingSoon ? `${item.label} (coming soon)` : item.label}
				aria-current={isActive(item.href) ? 'page' : undefined}
				class="w-9 h-9 rounded-lg flex items-center justify-center transition-colors cursor-pointer
					{isActive(item.href)
						? 'text-accent-fg bg-accent/10'
						: 'text-text-tertiary hover:text-text hover:bg-surface-hover'}
					{item.comingSoon && !isActive(item.href) ? 'opacity-50' : ''}"
			>
				{@html item.icon}
			</a>
		{/if}
	{/each}

	<!-- Spacer pushes Settings to the bottom of the rail -->
	<div class="flex-1"></div>

	<!-- Separator -->
	<div class="h-px w-6 bg-border/30 my-1"></div>

	<!-- Settings -->
	<a
		href={SETTINGS_HREF}
		data-sveltekit-preload-data="hover"
		title="Settings"
		aria-label="Settings"
		aria-current={settingsActive ? 'page' : undefined}
		class="w-9 h-9 rounded-lg flex items-center justify-center transition-colors cursor-pointer
			{settingsActive
				? 'text-accent-fg bg-accent/10'
				: 'text-text-tertiary hover:text-text hover:bg-surface-hover'}"
	>
		<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
			<circle cx="12" cy="12" r="3"/>
			<path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
		</svg>
	</a>
</div>

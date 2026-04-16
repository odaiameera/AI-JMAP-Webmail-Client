<script lang="ts">
	import type { Mailbox } from '$lib/jmap/types';
	import { page } from '$app/state';
	import { openCompose } from '$lib/stores/compose';

	let { mailboxes, hideHeader = false, collapsed = false, onToggleCollapse }: {
		mailboxes: Mailbox[];
		hideHeader?: boolean;
		collapsed?: boolean;
		onToggleCollapse?: () => void;
	} = $props();

	function getMailboxIcon(role: string | null): string {
		switch (role) {
			case 'inbox': return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>`;
			case 'drafts': return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`;
			case 'sent': return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;
			case 'trash': return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>`;
			case 'junk': return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
			case 'archive': return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`;
			case 'spam': return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
			default: return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>`;
		}
	}

	function getMailboxHref(mailbox: import('$lib/jmap/types').Mailbox): string {
		if (mailbox.role === 'inbox') return '/inbox';
		return `/folder/${mailbox.id}`;
	}

	function isActive(mailbox: import('$lib/jmap/types').Mailbox): boolean {
		if (mailbox.role === 'inbox') return page.url.pathname.startsWith('/inbox');
		return page.url.pathname === `/folder/${mailbox.id}`;
	}
</script>

<aside class="w-full h-full bg-surface flex flex-col overflow-hidden">
	{#if !hideHeader && !collapsed}
		<div class="px-4 py-3">
			<h1 class="text-lg font-bold text-text tracking-tight leading-none">ameera.</h1>
		</div>
	{/if}

	<!-- Compose -->
	<div class="{collapsed ? 'px-1.5 pt-2' : 'px-3 pt-2'} pb-1 mb-1">
		{#if collapsed}
			<button
				onclick={() => openCompose()}
				class="w-full aspect-square bg-accent hover:bg-accent-hover text-white rounded-lg
					flex items-center justify-center transition-colors cursor-pointer"
				title="Compose"
			>
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
					<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
				</svg>
			</button>
		{:else}
			<button
				onclick={() => openCompose()}
				class="w-full bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg
					px-4 py-2 transition-colors cursor-pointer"
			>
				Compose
			</button>
		{/if}
	</div>

	<!-- Nav -->
	<nav class="flex-1 overflow-y-auto py-1 {collapsed ? 'px-1.5' : 'px-2'}">
		{#each mailboxes.filter(m => m.name !== 'Sent Messages') as mailbox}
			{#if collapsed}
				<a
					href={getMailboxHref(mailbox)}
					title={mailbox.name}
					class="flex items-center justify-center py-2 rounded-lg transition-colors
						{isActive(mailbox)
							? 'bg-accent/10 text-accent'
							: 'text-text-secondary hover:bg-surface-hover hover:text-text'}"
				>
					<span class="w-4 h-4 shrink-0 flex items-center justify-center text-current">{@html getMailboxIcon(mailbox.role)}</span>
				</a>
			{:else}
				<a
					href={getMailboxHref(mailbox)}
					class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors
						{isActive(mailbox)
							? 'bg-accent/10 text-accent'
							: 'text-text-secondary hover:bg-surface-hover hover:text-text'}"
				>
					<span class="w-4 h-4 shrink-0 flex items-center justify-center text-current">{@html getMailboxIcon(mailbox.role)}</span>
					<span class="flex-1 truncate">{mailbox.name}</span>
					{#if mailbox.unreadEmails > 0}
						<span class="text-xs font-medium bg-accent/15 text-accent px-1.5 py-0.5 rounded-full">
							{mailbox.unreadEmails}
						</span>
					{/if}
				</a>
			{/if}
		{/each}
	</nav>

	<!-- Collapse toggle -->
	<div class="py-2 {collapsed ? 'px-1.5' : 'px-2'} border-t border-border">
		<button
			onclick={() => onToggleCollapse?.()}
			class="w-full flex items-center {collapsed ? 'justify-center' : 'gap-2.5 px-3'} py-2 rounded-lg text-sm text-text-tertiary
				hover:bg-surface-hover hover:text-text transition-colors cursor-pointer"
			title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
		>
			{#if collapsed}
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="9 18 15 12 9 6"/>
				</svg>
			{:else}
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="15 18 9 12 15 6"/>
				</svg>
				<span>Collapse</span>
			{/if}
		</button>
	</div>
</aside>

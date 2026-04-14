<script lang="ts">
	import type { Mailbox } from '$lib/jmap/types';
	import { page } from '$app/state';
	import { openCompose } from '$lib/stores/compose';

	let { mailboxes }: { mailboxes: Mailbox[] } = $props();

	function getMailboxIcon(role: string | null): string {
		switch (role) {
			case 'inbox': return '📥';
			case 'drafts': return '📝';
			case 'sent': return '📤';
			case 'trash': return '🗑️';
			case 'junk': return '⚠️';
			case 'archive': return '📦';
			default: return '📁';
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

<aside class="w-56 bg-surface border-r border-border flex flex-col h-screen shrink-0">
	<div class="px-4 py-4 border-b border-border">
		<h1 class="text-lg font-bold text-text">Webmail</h1>
	</div>

	<div class="px-2 pt-3 pb-1">
		<button
			onclick={() => openCompose()}
			class="w-full bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg
				px-4 py-2 transition-colors cursor-pointer"
		>
			Compose
		</button>
	</div>

	<nav class="flex-1 overflow-y-auto py-2 px-2">
		{#each mailboxes as mailbox}
			<a
				href={getMailboxHref(mailbox)}
				class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors
					{isActive(mailbox)
						? 'bg-accent/10 text-accent'
						: 'text-text-secondary hover:bg-surface-hover hover:text-text'}"
			>
				<span class="text-base">{getMailboxIcon(mailbox.role)}</span>
				<span class="flex-1 truncate">{mailbox.name}</span>
				{#if mailbox.unreadEmails > 0}
					<span class="text-xs font-medium bg-accent/15 text-accent px-1.5 py-0.5 rounded-full">
						{mailbox.unreadEmails}
					</span>
				{/if}
			</a>
		{/each}
	</nav>

	<div class="px-2 py-3 border-t border-border">
		<form method="POST" action="/logout">
			<button
				type="submit"
				class="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-text-tertiary
					hover:bg-surface-hover hover:text-text transition-colors cursor-pointer"
			>
				<span class="text-base">🚪</span>
				<span>Sign out</span>
			</button>
		</form>
	</div>
</aside>

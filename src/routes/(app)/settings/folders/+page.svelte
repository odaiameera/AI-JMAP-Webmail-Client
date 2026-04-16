<script lang="ts">
	import { pageTitle } from '$lib/utils/title';
	import type { LayoutData } from '../$types';
	import { LABEL_PREFIX } from '$lib/types/labels';

	let { data }: { data: LayoutData } = $props();

	const userFolders = $derived(
		data.mailboxes.filter((m) => m.role === null && !m.name.startsWith(LABEL_PREFIX))
	);
	const systemFolders = $derived(data.mailboxes.filter((m) => m.role !== null));
</script>

<svelte:head><title>{pageTitle({ page: 'Folders', subtitle: 'Settings' })}</title></svelte:head>

<header class="mb-6">
	<h1 class="text-xl font-semibold text-text">Folders</h1>
	<p class="text-sm text-text-tertiary mt-1">
		Folders are real JMAP mailboxes — they show up in Apple Mail, Outlook, and any other client
		connected to the same account. Create, rename, reparent, and delete them from the Folders
		section in the sidebar.
	</p>
</header>

<section class="flex flex-col gap-5">
	<div>
		<h2 class="text-xs font-semibold uppercase tracking-wider text-text-tertiary mb-2">Your folders</h2>
		{#if userFolders.length === 0}
			<p class="text-sm text-text-tertiary">No user folders yet.</p>
		{:else}
			<div class="flex flex-col gap-1.5">
				{#each userFolders as mb (mb.id)}
					<div class="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-hover/50 border border-border/60">
						<span class="flex-1 truncate text-sm text-text">{mb.name}</span>
						{#if mb.unreadEmails > 0}
							<span class="text-xs text-text-tertiary shrink-0">{mb.unreadEmails} unread</span>
						{/if}
						<a
							href={`/folder/${mb.id}`}
							class="text-xs text-text-tertiary hover:text-text transition-colors"
						>View →</a>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<div>
		<h2 class="text-xs font-semibold uppercase tracking-wider text-text-tertiary mb-2">System folders</h2>
		<p class="text-xs text-text-tertiary mb-2">These are managed by the server and can't be renamed or deleted.</p>
		<div class="flex flex-col gap-1.5">
			{#each systemFolders as mb (mb.id)}
				<div class="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-hover/30 border border-border/40">
					<span class="flex-1 truncate text-sm text-text-secondary">{mb.name}</span>
					<span class="text-[10px] text-text-tertiary uppercase tracking-wider">{mb.role ?? ''}</span>
				</div>
			{/each}
		</div>
	</div>

	<a
		href="/inbox"
		class="self-start text-sm bg-accent text-white px-3 py-1.5 rounded-lg hover:bg-accent-hover transition-colors"
	>
		Manage in sidebar →
	</a>
</section>

<script lang="ts">
	import { pageTitle } from '$lib/utils/title';
	import type { LayoutData } from '../$types';

	let { data }: { data: LayoutData } = $props();

	const labels = $derived(data.labels);
</script>

<svelte:head><title>{pageTitle({ page: 'Labels', subtitle: 'Settings' })}</title></svelte:head>

<header class="mb-6">
	<h1 class="text-xl font-semibold text-text">Labels</h1>
	<p class="text-sm text-text-tertiary mt-1">
		Labels are JMAP mailboxes under <code class="text-xs bg-surface-hover rounded px-1 py-0.5">labels/</code>.
		Create, rename, color, and delete them from the sidebar — hover the Labels section header to reveal
		the <span class="text-text">+</span> button, and hover any label row for edit and delete controls.
	</p>
</header>

<section class="flex flex-col gap-3">
	{#if labels.length === 0}
		<p class="text-sm text-text-tertiary">You haven't created any labels yet.</p>
	{:else}
		<div class="flex flex-col gap-1.5">
			{#each labels as label (label.id)}
				<div class="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-hover/50 border border-border/60">
					<span class="w-3 h-3 rounded-full shrink-0 border border-white/20" style="background-color: {label.color}"></span>
					<span class="flex-1 truncate text-sm text-text">{label.name}</span>
					<a
						href={`/folder/${label.id}`}
						class="text-xs text-text-tertiary hover:text-text transition-colors"
					>View →</a>
				</div>
			{/each}
		</div>
	{/if}

	<a
		href="/inbox"
		class="self-start text-sm bg-accent text-white px-3 py-1.5 rounded-lg hover:bg-accent-hover transition-colors"
	>
		Manage in sidebar →
	</a>
</section>

<script lang="ts">
	import EmailList from '$lib/components/EmailList.svelte';
	import { pageTitle } from '$lib/utils/title';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function pillClass(kind: string): string {
		if (kind === 'field') return 'bg-accent/15 text-accent ring-1 ring-accent/30';
		if (kind === 'flag') return 'bg-purple-500/15 text-purple-300 ring-1 ring-purple-500/30';
		if (kind === 'error') return 'bg-red-500/15 text-red-400 ring-1 ring-red-500/30';
		return 'bg-surface-hover text-text-secondary ring-1 ring-border';
	}

	const title = $derived(data.raw ? `Search: "${data.raw}"` : 'Search');
</script>

<svelte:head>
	<title>{pageTitle({ page: title })}</title>
</svelte:head>

{#if data.raw && data.tokens.length > 0}
	<div class="px-4 py-2 border-b border-border flex items-center gap-2 flex-wrap shrink-0">
		<span class="text-xs text-text-tertiary">Searching for</span>
		{#each data.tokens as t (t.start)}
			{#if t.kind === 'text'}
				<span class="px-1.5 py-0.5 rounded text-xs {pillClass('text')}">{t.value}</span>
			{:else if t.kind === 'field'}
				<span class="px-1.5 py-0.5 rounded text-xs font-medium {pillClass('field')}">{t.field}: {t.value}</span>
			{:else if t.kind === 'flag'}
				<span class="px-1.5 py-0.5 rounded text-xs font-medium {pillClass('flag')}">{t.op}: {t.value}</span>
			{:else if t.kind === 'error'}
				<span class="px-1.5 py-0.5 rounded text-xs font-medium {pillClass('error')}" title={t.reason}>{t.raw} · {t.reason}</span>
			{/if}
		{/each}
	</div>
{/if}

<div class="flex-1 min-h-0">
	<EmailList
		emails={data.emails}
		total={data.total}
		title="Search results"
		page={data.page}
		pageSize={data.pageSize}
		totalPages={data.totalPages}
	/>
</div>

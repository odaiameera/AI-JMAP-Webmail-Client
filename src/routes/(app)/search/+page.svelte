<script lang="ts">
	import EmailList from '$lib/components/EmailList.svelte';
	import { pageTitle } from '$lib/utils/title';
	import { goto } from '$app/navigation';
	import type { Token } from '$lib/search/parse';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function pillClass(kind: string): string {
		if (kind === 'field') return 'bg-accent/15 text-accent ring-1 ring-accent/30';
		if (kind === 'flag') return 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30';
		if (kind === 'error') return 'bg-red-500/15 text-red-400 ring-1 ring-red-500/30';
		return 'bg-surface-hover text-text-secondary ring-1 ring-border';
	}

	/** Remove one token's span from the raw query and re-run the search. */
	function removeToken(t: Token) {
		const next = (data.raw.slice(0, t.start) + data.raw.slice(t.end))
			.replace(/\s{2,}/g, ' ')
			.trim();
		if (!next) goto('/inbox');
		else goto(`/search?q=${encodeURIComponent(next)}`, { keepFocus: true });
	}

	const title = $derived(data.raw ? `Search: "${data.raw}"` : 'Search');
</script>

<svelte:head>
	<title>{pageTitle({ page: title })}</title>
</svelte:head>

{#if data.raw && data.tokens.length > 0}
	<div class="px-4 py-2 border-b border-border flex items-center gap-2 flex-wrap shrink-0">
		<span class="text-xs text-text-tertiary">Filters</span>
		{#each data.tokens as t (t.start)}
			{@const label =
				t.kind === 'field'
					? `${t.field}: ${t.value}`
					: t.kind === 'flag'
						? `${t.op}: ${t.value}`
						: t.kind === 'error'
							? `${t.raw} · ${t.reason}`
							: t.value}
			<button
				type="button"
				onclick={() => removeToken(t)}
				class="group inline-flex items-center gap-1 pl-1.5 pr-1 py-0.5 rounded text-xs font-medium cursor-pointer transition-colors {pillClass(t.kind)}"
				title={t.kind === 'error' && 'reason' in t ? t.reason : `Remove "${label}"`}
			>
				<span>{label}</span>
				<span class="opacity-50 group-hover:opacity-100 transition-opacity">
					<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
				</span>
			</button>
		{/each}
		<button
			type="button"
			onclick={() => goto('/inbox')}
			class="text-xs text-text-tertiary hover:text-text px-1.5 py-0.5 rounded hover:bg-surface-hover cursor-pointer"
		>
			Clear all
		</button>
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

<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { LIST_FILTERS, parseListFilter } from '$lib/email-filters';

	const active = $derived(parseListFilter(page.url.searchParams.get('filter')));

	function select(key: string) {
		const url = new URL(page.url);
		if (key === 'all') url.searchParams.delete('filter');
		else url.searchParams.set('filter', key);
		// Changing the filter resets to the first page.
		url.searchParams.delete('page');
		goto(url.pathname + url.search, { keepFocus: true, noScroll: true });
	}
</script>

<div class="flex items-center gap-1.5 px-4 py-2 border-b border-border overflow-x-auto shrink-0">
	{#each LIST_FILTERS as f (f.key)}
		<button
			type="button"
			onclick={() => select(f.key)}
			class="px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer border
				{active === f.key
				? 'bg-accent/15 text-accent border-accent/40'
				: 'bg-transparent text-text-tertiary border-border hover:text-text-secondary hover:border-text-tertiary'}"
		>
			{f.label}
		</button>
	{/each}
</div>

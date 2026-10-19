<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { LIST_FILTERS, parseListFilter } from '$lib/email-filters';

	const active = $derived(parseListFilter(page.url.searchParams.get('filter')));
	const activeLabel = $derived(LIST_FILTERS.find((f) => f.key === active)?.label ?? 'All');
	let open = $state(false);

	function select(key: string) {
		open = false;
		const url = new URL(page.url);
		if (key === 'all') url.searchParams.delete('filter');
		else url.searchParams.set('filter', key);
		// Changing the filter resets to the first page.
		url.searchParams.delete('page');
		goto(url.pathname + url.search, { keepFocus: true, noScroll: true });
	}
</script>

<div class="relative shrink-0">
	<button
		type="button"
		onclick={(e) => { e.stopPropagation(); open = !open; }}
		title={active === 'all' ? 'Filter' : `Filter: ${activeLabel}`}
		aria-label="Filter messages"
		aria-haspopup="menu"
		aria-expanded={open}
		class="p-1.5 rounded-md transition-colors cursor-pointer
			{active !== 'all' || open ? 'text-accent-fg bg-accent/10' : 'text-text-secondary hover:text-text hover:bg-surface-hover'}"
	>
		<Icon name="filter" size={16} />
	</button>

	{#if open}
		<button
			type="button"
			class="fixed inset-0 z-20 cursor-default"
			aria-label="Close filter menu"
			onclick={() => (open = false)}
		></button>
		<div class="absolute right-0 top-full mt-1 z-30 min-w-[168px] rounded-xl border border-border bg-surface p-1 shadow-[0_8px_32px_rgba(0,0,0,0.45)]" role="menu">
			{#each LIST_FILTERS as f (f.key)}
				<button
					type="button"
					role="menuitemradio"
					aria-checked={active === f.key}
					onclick={() => select(f.key)}
					class="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors cursor-pointer
						{active === f.key ? 'text-accent-fg bg-accent/10' : 'text-text-secondary hover:text-text hover:bg-surface-hover'}"
				>
					<span>{f.label}</span>
					{#if active === f.key}
						<Icon name="check" size={14} />
					{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>

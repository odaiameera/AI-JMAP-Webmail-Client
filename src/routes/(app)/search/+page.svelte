<script lang="ts">
	import EmailListItem from '$lib/components/EmailListItem.svelte';
	import { pageTitle } from '$lib/utils/title';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{pageTitle({ page: data.query ? `Search: "${data.query}"` : 'Search' })}</title>
</svelte:head>

<div class="h-full flex flex-col">
	<header class="px-4 py-3 border-b border-border shrink-0">
		{#if data.query}
			<h2 class="text-lg font-semibold text-text">{data.total} results for &ldquo;{data.query}&rdquo;</h2>
		{:else}
			<h2 class="text-lg font-semibold text-text">Search</h2>
			<p class="text-xs text-text-tertiary">Enter a query above</p>
		{/if}
	</header>

	<div class="flex-1 overflow-y-auto">
		{#if data.query && data.emails.length === 0}
			<div class="flex items-center justify-center h-full text-text-tertiary">
				<p>No results for &ldquo;{data.query}&rdquo;</p>
			</div>
		{:else}
			{#each data.emails as email (email.id)}
				<EmailListItem {email} />
			{/each}
		{/if}
	</div>
</div>

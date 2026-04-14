<script lang="ts">
	import EmailListItem from '$lib/components/EmailListItem.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{data.mailboxName} — Webmail</title>
</svelte:head>

<div class="h-full flex flex-col">
	<header class="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
		<div>
			<h2 class="text-lg font-semibold text-text">{data.mailboxName}</h2>
			<p class="text-xs text-text-tertiary">{data.total} messages</p>
		</div>
	</header>

	<div class="flex-1 overflow-y-auto">
		{#if data.emails.length === 0}
			<div class="flex items-center justify-center h-full text-text-tertiary">
				<p>No messages</p>
			</div>
		{:else}
			{#each data.emails as email (email.id)}
				<EmailListItem {email} />
			{/each}
		{/if}
	</div>
</div>

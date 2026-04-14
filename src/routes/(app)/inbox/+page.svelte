<script lang="ts">
	import EmailList from '$lib/components/EmailList.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Inbox — Webmail</title>
</svelte:head>

<EmailList emails={data.emails} total={data.total} title="Inbox" mailboxId={data.mailboxId} />

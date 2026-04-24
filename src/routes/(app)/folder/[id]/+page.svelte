<script lang="ts">
	import EmailList from '$lib/components/EmailList.svelte';
	import { pageTitle } from '$lib/utils/title';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{pageTitle({ page: data.mailboxName, count: data.unreadCount })}</title>
</svelte:head>

<EmailList
	emails={data.emails}
	total={data.total}
	title={data.mailboxName}
	mailboxId={data.mailboxId}
	page={data.page}
	pageSize={data.pageSize}
	totalPages={data.totalPages}
/>

<script lang="ts">
	import EmailList from '$lib/components/EmailList.svelte';
	import { pageTitle } from '$lib/utils/title';
	import { page } from '$app/state';
	import type { Mailbox } from '$lib/jmap/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const unreadCount = $derived(
		(page.data.mailboxes as Mailbox[] | undefined)?.find((m) => m.id === data.mailboxId)
			?.unreadEmails ?? 0
	);
</script>

<svelte:head>
	<title>{pageTitle({ page: 'Inbox', count: unreadCount })}</title>
</svelte:head>

<EmailList
	emails={data.emails}
	total={data.total}
	title="Inbox"
	mailboxId={data.mailboxId}
	page={data.page}
	pageSize={data.pageSize}
	totalPages={data.totalPages}
	showFilters
/>

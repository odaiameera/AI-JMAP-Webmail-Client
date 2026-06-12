<script lang="ts">
	import EmailList from '$lib/components/EmailList.svelte';
	import { pageTitle } from '$lib/utils/title';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{pageTitle({ page: 'Flagged' })}</title>
</svelte:head>

<EmailList
	emails={data.emails}
	total={data.total}
	title="Flagged"
	page={data.page}
	pageSize={data.pageSize}
	totalPages={data.totalPages}
/>

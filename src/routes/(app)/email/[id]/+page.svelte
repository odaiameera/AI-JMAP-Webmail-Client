<script lang="ts">
	import EmailDetail from '$lib/components/EmailDetail.svelte';
	import { pageTitle, truncateSubject } from '$lib/utils/title';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{pageTitle({ page: truncateSubject(data.email.subject) })}</title>
</svelte:head>

<EmailDetail email={data.email} />

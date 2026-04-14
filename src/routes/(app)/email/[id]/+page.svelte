<script lang="ts">
	import EmailDetail from '$lib/components/EmailDetail.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{data.email.subject || '(no subject)'} — Webmail</title>
</svelte:head>

<EmailDetail email={data.email} />

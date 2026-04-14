<script lang="ts">
	import Sidebar from '$lib/components/Sidebar.svelte';
	import ComposeModal from '$lib/components/ComposeModal.svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: any } = $props();
</script>

<div class="flex h-screen overflow-hidden bg-bg">
	<Sidebar mailboxes={data.mailboxes} />
	<main class="flex-1 overflow-y-auto">
		{@render children()}
	</main>
</div>

<ComposeModal />

<script lang="ts">
	import Sidebar from '$lib/components/Sidebar.svelte';
	import AppRail from '$lib/components/AppRail.svelte';
	import ComposeModal from '$lib/components/ComposeModal.svelte';
	import { onMount, setContext } from 'svelte';
	import { createReadingPaneStore } from '$lib/stores/readingPane';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: any } = $props();

	// eslint-disable-next-line -- intentionally capturing initial values from server cookies
	let { readingPaneDefault, theme: initialTheme } = data;
	const readingPane = createReadingPaneStore(readingPaneDefault);
	setContext('readingPane', readingPane);

	onMount(() => {
		const handler = () => readingPane.setFromViewport(window.innerWidth);
		window.addEventListener('resize', handler);
		return () => window.removeEventListener('resize', handler);
	});
</script>

<div class="flex h-screen overflow-hidden bg-bg">
	<Sidebar mailboxes={data.mailboxes} />
	<main class="flex-1 overflow-hidden min-w-0">
		{@render children()}
	</main>
	<AppRail initialTheme={initialTheme} />
</div>

<ComposeModal />

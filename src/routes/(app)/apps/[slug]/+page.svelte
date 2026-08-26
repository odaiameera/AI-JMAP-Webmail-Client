<script lang="ts">
	import { pageTitle } from '$lib/utils/title';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const titles: Record<string, string> = {
		ai: 'AI Assistant',
		contacts: 'Contacts',
		tasks: 'Tasks'
	};

	const title = $derived(titles[data.slug] ?? data.slug);
</script>

<svelte:head>
	<title>{pageTitle({ page: title })}</title>
</svelte:head>

<div class="h-full flex items-center justify-center">
	<div class="text-center max-w-md px-6">
		<div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-accent/10 flex items-center justify-center">
			<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-accent-fg">
				<circle cx="12" cy="12" r="10"/>
				<polyline points="12 6 12 12 16 14"/>
			</svg>
		</div>
		<h1 class="text-xl font-semibold text-text mb-1">
			{title} — coming soon
		</h1>
		<p class="text-sm text-text-tertiary">
			This app is on the roadmap. For now, use the mail tab to get back to work.
		</p>
		<a href="/inbox" class="inline-block mt-6 text-sm text-accent-fg hover:text-accent-fg-hover transition-colors">
			&larr; Back to inbox
		</a>
	</div>
</div>

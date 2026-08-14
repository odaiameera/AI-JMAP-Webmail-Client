<script lang="ts">
	import type { Snippet } from 'svelte';

	export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

	let {
		title,
		description,
		state = 'idle',
		errorMessage,
		control
	}: {
		title: string;
		description?: string;
		state?: SaveState;
		errorMessage?: string;
		control: Snippet;
	} = $props();
</script>

<div class="flex items-start gap-6 py-4 border-b border-border last:border-b-0">
	<div class="flex-1 min-w-0">
		<p class="text-sm font-medium text-text">{title}</p>
		{#if description}
			<p class="text-xs text-text-tertiary mt-1">{description}</p>
		{/if}
		{#if state === 'error' && errorMessage}
			<p class="text-xs text-danger mt-1">{errorMessage}</p>
		{/if}
	</div>

	<div class="flex items-center gap-2 shrink-0">
		{#if state === 'saving'}
			<span class="text-[11px] text-text-tertiary inline-flex items-center gap-1.5">
				<span class="w-3 h-3 rounded-full border-2 border-accent/40 border-t-accent animate-spin"></span>
				Saving…
			</span>
		{:else if state === 'saved'}
			<span class="text-[11px] text-accent inline-flex items-center gap-1">
				<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
				Saved
			</span>
		{/if}
		{@render control()}
	</div>
</div>

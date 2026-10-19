<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { composer, openCompose } from '$lib/stores/compose';

	/**
	 * The two things you can start from anywhere, in the bottom-right corner:
	 * the AI mail agent, and (in Mail) Compose beside it. They step aside
	 * while a message is being written, since the composer docks in the same
	 * corner and is what you're working in then.
	 */
	let {
		assistantOpen,
		onToggleAssistant,
		showCompose,
		/** Phones: an open message, where a floating button would cover the text. */
		readingOnPhone = false
	}: {
		assistantOpen: boolean;
		onToggleAssistant: () => void;
		showCompose: boolean;
		readingOnPhone?: boolean;
	} = $props();

	const hidden = $derived($composer.mode !== 'closed');
</script>

<div
	class="fixed z-[35] flex items-center gap-2.5 transition-[opacity,transform] duration-200
		md:right-[68px] md:bottom-5
		max-md:right-4 max-md:bottom-[calc(6.5rem+env(safe-area-inset-bottom))]
		{readingOnPhone ? 'max-md:hidden' : ''}
		{hidden ? 'opacity-0 translate-y-2 pointer-events-none' : 'opacity-100'}"
	inert={hidden}
>
	{#if showCompose}
		<button
			type="button"
			onclick={() => openCompose()}
			class="h-12 w-12 grid place-items-center rounded-full bg-accent hover:bg-accent-hover text-white shadow-[0_8px_24px_rgba(0,0,0,0.35)] cursor-pointer transition-colors"
			aria-label="Compose"
			title="Compose"
		>
			<Icon name="compose" size={20} />
		</button>
	{/if}
	<button
		type="button"
		onclick={onToggleAssistant}
		aria-label={assistantOpen ? 'Close AI mail agent' : 'Open AI mail agent'}
		aria-pressed={assistantOpen}
		title="AI mail agent"
		class="h-12 w-12 grid place-items-center rounded-full border shadow-[0_8px_24px_rgba(0,0,0,0.35)] cursor-pointer transition-colors
			{assistantOpen
				? 'bg-accent/15 border-accent/60 text-accent-fg'
				: 'bg-surface border-border text-text-secondary hover:text-accent-fg hover:border-accent/40'}"
	>
		<Icon name="assistant" size={20} />
	</button>
</div>

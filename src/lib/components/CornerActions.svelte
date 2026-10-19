<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { composer, openCompose, requestCloseCompose } from '$lib/stores/compose';

	/**
	 * The two things you can start from anywhere, in the bottom-right corner:
	 * Raven, the AI mail agent, and (in Mail) Compose beside it. Their windows open
	 * above them, so they stay put while either is open.
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

	// Compose again closes what's being written: saved as a draft if it has
	// anything in it, gone if it's empty.
	const composing = $derived($composer.mode !== 'closed');
</script>

<div
	class="fixed z-[35] flex items-center gap-2.5
		md:right-[68px] md:bottom-5
		max-md:right-4 max-md:bottom-[calc(6.5rem+env(safe-area-inset-bottom))]
		{readingOnPhone ? 'max-md:hidden' : ''}"
>
	{#if showCompose}
		<button
			type="button"
			onclick={() => (composing ? requestCloseCompose() : openCompose())}
			class="h-12 w-12 grid place-items-center rounded-full bg-accent hover:bg-accent-hover text-white shadow-[0_8px_24px_rgba(0,0,0,0.35)] cursor-pointer transition-colors"
			aria-label={composing ? 'Close message' : 'Compose'}
			title={composing ? 'Close message' : 'Compose'}
		>
			<Icon name="compose" size={20} />
		</button>
	{/if}
	<button
		type="button"
		onclick={onToggleAssistant}
		aria-label={assistantOpen ? 'Close Raven' : 'Open Raven'}
		aria-pressed={assistantOpen}
		title="Raven"
		class="agent h-12 w-12 grid place-items-center rounded-full text-white shadow-[0_8px_24px_rgba(0,0,0,0.35)] cursor-pointer transition-[filter] hover:brightness-110"
	>
		<Icon name="assistant" size={20} />
	</button>
</div>

<style>
	/* A click is shown by the window opening, not a ring round the button;
	   the keyboard focus ring stays. */
	button:focus:not(:focus-visible) {
		outline: none;
	}
	/* The agent's own colour: teal into a light navy, the same in both themes. */
	.agent {
		background: linear-gradient(135deg, #14b8a6 0%, #1f8ea3 45%, #2d4f9e 100%);
	}
</style>

<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import type { IconNode } from '$lib/types/icon-node';

	/**
	 * A folder's or label's own icon, picked by its owner, in its colour. With
	 * none picked, a folder is the plain folder and a label its colour dot.
	 * Same stroke and sizes as Icon.svelte, so it sits with the app's icons.
	 */
	let {
		node,
		fallback,
		color = null,
		size = 16,
		class: className = ''
	}: {
		node: IconNode | null | undefined;
		fallback: 'folder' | 'dot';
		color?: string | null;
		size?: 12 | 14 | 16 | 20;
		class?: string;
	} = $props();

	const style = $derived(color ? `color: ${color}` : undefined);
	// The dot is drawn smaller than an icon so it reads at the same weight.
	const dot = $derived(Math.round(size * 0.65));
</script>

{#if node}
	<svg
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 24 24"
		width={size}
		height={size}
		fill="none"
		stroke="currentColor"
		stroke-width="1.75"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
		class="shrink-0 {className}"
		{style}
	>
		{#each node as [tag, attrs], i (i)}
			<svelte:element this={tag} {...attrs} />
		{/each}
	</svg>
{:else if fallback === 'folder'}
	<span class="contents" {style}><Icon name="folder" {size} class={className} /></span>
{:else}
	<span
		class="shrink-0 rounded-full border border-white/20 {className}"
		style="width: {dot}px; height: {dot}px; background-color: {color ?? 'currentColor'}"
		aria-hidden="true"
	></span>
{/if}

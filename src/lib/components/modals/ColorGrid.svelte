<script lang="ts">
	import { LABEL_COLORS, type LabelColor } from '$lib/constants/colors';

	let {
		value,
		onChange
	}: {
		value: LabelColor;
		onChange: (color: LabelColor) => void;
	} = $props();
</script>

<!-- w-max keeps the tracks content-sized: inside shrink-to-fit containers
     (popovers) 1fr tracks collapse under the fixed-size swatches and the
     circles overlap; in wide containers they over-spread. -->
<div class="grid w-max grid-cols-5 gap-2.5">
	{#each LABEL_COLORS as color (color.hex)}
		{@const selected = value.hex.toLowerCase() === color.hex.toLowerCase()}
		<button
			type="button"
			class="w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
			class:ring-2={selected}
			class:ring-offset-2={selected}
			class:ring-offset-surface={selected}
			style="background-color: {color.hex}; --tw-ring-color: {color.hex};"
			aria-label={color.name}
			aria-pressed={selected}
			title={color.name}
			onclick={() => onChange(color)}
		>
			{#if selected}
				<svg class="w-4 h-4 text-white drop-shadow" viewBox="0 0 20 20" fill="currentColor">
					<path
						fill-rule="evenodd"
						d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
						clip-rule="evenodd"
					/>
				</svg>
			{/if}
		</button>
	{/each}
</div>

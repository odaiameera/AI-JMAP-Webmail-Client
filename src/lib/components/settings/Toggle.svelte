<script lang="ts">
	/**
	 * Unified toggle used across `/settings/*` and the quick-settings
	 * island. On-state is green (bg-green-500), off-state is the dark
	 * surface with a border. The knob geometry (w-5 inside w-11 at
	 * translate-x-0.5 / translate-x-5) keeps it inside the pill on both
	 * sides.
	 */

	let {
		checked = false,
		onChange,
		disabled = false,
		label
	}: {
		checked?: boolean;
		onChange?: (value: boolean) => void;
		disabled?: boolean;
		label?: string;
	} = $props();
</script>

<button
	type="button"
	role="switch"
	aria-checked={checked}
	aria-label={label ?? 'Toggle'}
	disabled={disabled}
	onclick={() => onChange?.(!checked)}
	class="relative w-11 h-6 rounded-full transition-colors cursor-pointer shrink-0 disabled:opacity-50 disabled:cursor-not-allowed
		{checked ? 'bg-green-500' : 'bg-surface-hover border border-border'}"
>
	<span
		class="absolute top-0.5 transition-transform w-5 h-5 rounded-full bg-white shadow-sm
			{checked ? 'translate-x-5' : 'translate-x-0.5'}"
	></span>
</button>

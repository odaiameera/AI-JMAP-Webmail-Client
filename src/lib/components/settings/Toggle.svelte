<script lang="ts">
	let {
		checked,
		onchange,
		disabled = false,
		label
	}: {
		checked: boolean;
		onchange: (next: boolean) => void;
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
	onclick={() => onchange(!checked)}
	class="relative w-11 h-6 rounded-full transition-colors cursor-pointer shrink-0 disabled:opacity-50 disabled:cursor-not-allowed
		{checked ? 'bg-accent' : 'bg-surface-hover border border-border'}"
>
	<span
		class="absolute top-0.5 transition-transform w-5 h-5 rounded-full bg-white shadow-sm
			{checked ? 'translate-x-5' : 'translate-x-0.5'}"
	></span>
</button>

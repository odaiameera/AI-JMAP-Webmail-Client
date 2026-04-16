<script lang="ts">
	let {
		value,
		options,
		onchange,
		disabled = false,
		ariaLabel
	}: {
		value: string;
		options: { value: string; label: string }[];
		onchange: (next: string) => void;
		disabled?: boolean;
		ariaLabel?: string;
	} = $props();
</script>

<select
	aria-label={ariaLabel}
	disabled={disabled}
	value={value}
	onchange={(e) => onchange((e.currentTarget as HTMLSelectElement).value)}
	class="bg-surface-hover border border-border rounded-lg px-2.5 py-1.5 text-sm text-text outline-none focus:border-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-[160px]"
>
	{#each options as opt}
		<option value={opt.value}>{opt.label}</option>
	{/each}
</select>

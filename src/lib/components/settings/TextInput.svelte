<script lang="ts">
	let {
		value = $bindable(),
		placeholder,
		type = 'text',
		onSave,
		disabled = false,
		ariaLabel,
		width = '220px'
	}: {
		value: string;
		placeholder?: string;
		type?: 'text' | 'number';
		/** Called on blur or Enter. The parent decides what to persist. */
		onSave?: (next: string) => void;
		disabled?: boolean;
		ariaLabel?: string;
		width?: string;
	} = $props();
</script>

<input
	type={type}
	bind:value
	placeholder={placeholder}
	aria-label={ariaLabel}
	disabled={disabled}
	onblur={() => onSave?.(value)}
	onkeydown={(e) => { if (e.key === 'Enter') onSave?.(value); }}
	class="bg-surface-hover border border-border rounded-lg px-2.5 py-1.5 text-sm text-text placeholder-text-tertiary outline-none focus:border-accent transition-colors disabled:opacity-50"
	style="width: {width};"
/>

<script lang="ts">
	import { userState } from '$lib/stores/userState';
	import { composer, setSignature } from '$lib/stores/compose';

	let signatures = $derived($userState.signatures);
	let current = $derived($composer.signatureId);

	function handleChange(e: Event) {
		const val = (e.target as HTMLSelectElement).value;
		setSignature(val === '' ? null : Number(val), true);
	}
</script>

<div class="flex items-center gap-1" title="Signature">
	<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" class="text-text-tertiary shrink-0">
		<path d="M12 19l7-7 3 3-7 7-3-3z"/>
		<path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
		<path d="M2 2l7.586 7.586"/>
		<circle cx="11" cy="11" r="2"/>
	</svg>
	<select
		class="fc-select w-[140px]"
		value={current ?? ''}
		onchange={handleChange}
		aria-label="Signature"
	>
		<option value="">No signature</option>
		{#each signatures as sig (sig.id)}
			<option value={sig.id}>{sig.name}{sig.isDefault ? ' (default)' : ''}</option>
		{/each}
	</select>
</div>

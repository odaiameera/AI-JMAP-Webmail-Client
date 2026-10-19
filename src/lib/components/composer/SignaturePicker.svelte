<script lang="ts">
	import { userState } from '$lib/stores/userState';
	import { composer, setSignature } from '$lib/stores/compose';
	import MenuSelect from '$lib/components/MenuSelect.svelte';

	const options = $derived([
		{ value: null as number | null, label: 'No signature' },
		...$userState.signatures.map((sig) => ({ value: sig.id as number | null, label: sig.name }))
	]);
</script>

{#snippet penIcon()}
	<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" class="text-text-tertiary shrink-0" aria-hidden="true">
		<path d="M12 19l7-7 3 3-7 7-3-3z"/>
		<path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
		<path d="M2 2l7.586 7.586"/>
		<circle cx="11" cy="11" r="2"/>
	</svg>
{/snippet}

<MenuSelect
	value={$composer.signatureId}
	{options}
	onChange={(id) => setSignature(id, true)}
	ariaLabel="Signature"
	icon={penIcon}
	align="right"
	placement="up"
	triggerClass="text-xs"
/>

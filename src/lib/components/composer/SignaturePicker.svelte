<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { userState } from '$lib/stores/userState';
	import { composer, setSignature } from '$lib/stores/compose';
	import MenuSelect from '$lib/components/MenuSelect.svelte';

	const options = $derived([
		{ value: null as number | null, label: 'No signature' },
		...$userState.signatures.map((sig) => ({ value: sig.id as number | null, label: sig.name }))
	]);
</script>

<!-- An icon like the footer's other tools; blue while a signature is on. -->
{#snippet penIcon()}
	<Icon name="signature" class={$composer.signatureId === null ? '' : 'text-accent-fg'} />
{/snippet}

<MenuSelect
	value={$composer.signatureId}
	{options}
	onChange={(id) => setSignature(id, true)}
	ariaLabel="Signature"
	icon={penIcon}
	align="right"
	placement="up"
	iconOnly
	triggerClass="fc-btn !w-7 !px-0 justify-center text-text-secondary"
/>
